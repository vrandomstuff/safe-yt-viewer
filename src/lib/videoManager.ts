import {
	blacklist,
	videoCache,
	videoResolutions,
	watchData
} from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/instrumentation";
import { sanitizeText } from "@/lib/sanitizeText";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const playlist_root = "https://www.youtube.com/playlist?list=";

// The m3u8 endpoints run on every playback, so their progress chatter is pure
// noise in production. Set VERBOSE_LOG=1 to get it back. Errors always log,
// since console.error is the only signal that something actually went wrong.
function logVerbose(...args: unknown[]) {
	if (process.env.VERBOSE_LOG === "1") {
		console.log(...args);
	}
}

export function getThumbnailUrl(video_id: string): string {
	return `https://i.ytimg.com/vi/${video_id}/hq720.jpg`;
}

export type M3u8Playlists = {
	videoPlaylistUrl: string;
	audioPlaylistUrl: string;
	videoFormatId: string;
	audioFormatId: string;
	videoWidth: number;
	videoHeight: number;
	videoBandwidth: number;
};

export type M3u8LookupResult =
	| { ok: true; playlists: M3u8Playlists }
	| {
			ok: false;
			reason:
				"invalid_request" | "not_cached" | "bad_resolution" | "error";
	  };

type YtDlpFormat = {
	format_id: string;
	protocol: string;
	vcodec: string;
	acodec: string;
	format_note?: string;
	language?: string;
	width?: number;
	height?: number;
	tbr?: number | null;
	url: string;
};

// The itag on its own, with any language suffix stripped. Auto-dubbed videos
// make yt-dlp emit suffixed itags like "234-19", and Number("234-19") is NaN,
// so any comparison built straight on format_id silently fails to order.
function baseItag(format: YtDlpFormat): number {
	return Number.parseInt(format.format_id.split("-")[0], 10);
}

// YouTube ships auto-dubs and manual translations as extra audio tracks, and
// yt-dlp hands back one m3u8 itag per language ("233-0", "234-19", ...). The
// untouched track is the one YouTube marks "original"; videos with no dubs
// have a bare itag and note "Default, high". Prefer in this order: never a
// dub, then the marked original, then English, then the higher bitrate tier
// (234 high beats 233 low).
function pickOriginalAudio(formats: YtDlpFormat[]): YtDlpFormat | undefined {
	const isDub = (format: YtDlpFormat) =>
		/dubbed/i.test(format.format_note ?? "");
	const isOriginal = (format: YtDlpFormat) =>
		/original/i.test(format.format_note ?? "");
	const isEnglish = (format: YtDlpFormat) =>
		/^en(-|$)/i.test(format.language ?? "");
	return [...formats].sort(
		(a, b) =>
			Number(isDub(a)) - Number(isDub(b)) ||
			Number(isOriginal(b)) - Number(isOriginal(a)) ||
			Number(isEnglish(b)) - Number(isEnglish(a)) ||
			baseItag(b) - baseItag(a) ||
			a.format_id.localeCompare(b.format_id)
	)[0];
}

// The m3u8 route is public and yt-dlp takes seconds per run, so without this
// any caller could fan out one yt-dlp process per request. Concurrent lookups
// for the same video collapse onto a single run, and results are reused for a
// short window because the googlevideo URLs are only good for a few hours.
const formatCacheTtlMs = 5 * 60 * 1000;
const formatCacheLimit = 64;
const formatCache = new Map<
	string,
	{ expiresAt: number; formats: YtDlpFormat[] }
>();
const inFlightFormats = new Map<string, Promise<YtDlpFormat[]>>();

async function fetchHlsFormats(video_id: string): Promise<YtDlpFormat[]> {
	const cached = formatCache.get(video_id);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.formats;
	}
	const alreadyRunning = inFlightFormats.get(video_id);
	if (alreadyRunning) {
		return alreadyRunning;
	}

	const run = (async () => {
		const startedAt = new Date();
		logVerbose(
			`Starting yt-dlp for ${video_id} at ${startedAt.toISOString()}`
		);
		let stdout: string;
		try {
			({ stdout } = await execFileAsync(
				"yt-dlp",
				[
					"--dump-single-json",
					"--no-warnings",
					`https://www.youtube.com/watch?v=${video_id}`
				],
				{ maxBuffer: 64 * 1024 * 1024 }
			));
		} finally {
			const finishedAt = new Date();
			logVerbose(
				`Finished yt-dlp for ${video_id} at ${finishedAt.toISOString()} after ${finishedAt.getTime() - startedAt.getTime()}ms`
			);
		}
		const jsonData: { formats?: YtDlpFormat[] } = JSON.parse(stdout);
		if (!Array.isArray(jsonData.formats)) {
			throw new Error(`No formats returned for ${video_id}.`);
		}
		// keep the map bounded: it is only a short-lived optimisation, and
		// insertion order is enough to evict something once it is full
		if (formatCache.size >= formatCacheLimit) {
			const oldest = formatCache.keys().next().value;
			if (oldest !== undefined) {
				formatCache.delete(oldest);
			}
		}
		formatCache.set(video_id, {
			expiresAt: Date.now() + formatCacheTtlMs,
			formats: jsonData.formats
		});
		return jsonData.formats;
	})();

	inFlightFormats.set(video_id, run);
	try {
		return await run;
	} finally {
		inFlightFormats.delete(video_id);
	}
}

export type WatchRecordReason = "invalid_request" | "not_cached" | "error";

export type WatchRecordResult =
	{ ok: true } | { ok: false; reason: WatchRecordReason };

// Deliberately separate from getM3u8Playlists: a player asks for the master
// playlist several times per playback (startup, bandwidth probes, retries) and
// each of those used to append a watchData row. Clients that want a watch
// recorded call this once, from /api/watch.
export async function recordWatch(
	video_id: string
): Promise<WatchRecordResult> {
	if (!/^[a-zA-Z0-9_-]{11}$/.test(video_id)) {
		console.error(`Invalid video id "${video_id}".`);
		return { ok: false, reason: "invalid_request" };
	}
	try {
		const cached = await db
			.select({ title: videoCache.title })
			.from(videoCache)
			.where(eq(videoCache.videoId, video_id))
			.limit(1);
		if (cached.length !== 1) {
			logVerbose(
				`Refusing to record a watch of ${video_id} since it is not in the video cache`
			);
			return { ok: false, reason: "not_cached" };
		}
		const entry: typeof watchData.$inferInsert = {
			videoId: video_id,
			title: sanitizeText(cached[0].title)
		};
		// no onConflict clause: watchData's primary key is eventDate, which is
		// defaultNow() and never supplied here, so every row is unique
		await db.insert(watchData).values(entry);
		return { ok: true };
	} catch (error) {
		console.error(`Error in recordWatch("${video_id}"): ${error}`);
		return { ok: false, reason: "error" };
	}
}

export async function getM3u8Playlists(
	video_id: string,
	resolution: number
): Promise<M3u8LookupResult> {
	const startedAt = new Date();
	logVerbose(
		`Starting m3u8 lookup for ${video_id} at ${startedAt.toISOString()}`
	);

	try {
		if (!Number.isFinite(resolution) || resolution <= 0) {
			console.error(`Invalid resolution "${resolution}".`);
			return { ok: false, reason: "invalid_request" };
		}
		if (!/^[a-zA-Z0-9_-]{11}$/.test(video_id)) {
			console.error(`Invalid video id "${video_id}".`);
			return { ok: false, reason: "invalid_request" };
		}

		// Access control only. This used to also append a watchData row, which
		// meant every playlist re-fetch inflated the watch history; recording a
		// watch is now the separate job of recordWatch via /api/watch.
		const cached = await db
			.select({ videoId: videoCache.videoId })
			.from(videoCache)
			.where(eq(videoCache.videoId, video_id))
			.limit(1);
		if (cached.length !== 1) {
			logVerbose(
				`Refusing to serve ${video_id} since it is not in the video cache`
			);
			return { ok: false, reason: "not_cached" };
		}

		const knownHeights = await db
			.select({ height: videoResolutions.height })
			.from(videoResolutions)
			.where(eq(videoResolutions.videoId, video_id));
		if (knownHeights.length > 0) {
			const lowest = Math.min(...knownHeights.map((row) => row.height));
			if (resolution < lowest) {
				logVerbose(
					`Refusing ${resolution} for ${video_id} since the lowest known m3u8 format is ${lowest}`
				);
				return { ok: false, reason: "bad_resolution" };
			}
		}

		const hlsFormats = (await fetchHlsFormats(video_id)).filter(
			(format) => format.protocol === "m3u8_native" && !!format.url
		);
		const availableHeights = [
			...new Set(
				hlsFormats
					.filter(
						(format) =>
							format.vcodec !== "none" &&
							typeof format.height === "number"
					)
					.map((format) => format.height as number)
			)
		];
		if (availableHeights.length > 0) {
			await db
				.delete(videoResolutions)
				.where(eq(videoResolutions.videoId, video_id));
			const entries: (typeof videoResolutions.$inferInsert)[] =
				availableHeights.map((height) => ({
					videoId: video_id,
					height
				}));
			await db
				.insert(videoResolutions)
				.values(entries)
				.onConflictDoNothing();
			logVerbose(
				`Cached m3u8 heights for ${video_id}: ${availableHeights.sort((a, b) => b - a).join(", ")}`
			);
		}

		const videoFormats = hlsFormats
			.filter(
				(format) =>
					format.vcodec !== "none" &&
					typeof format.height === "number" &&
					typeof format.width === "number"
			)
			.filter((format) => (format.height as number) <= resolution);
		if (videoFormats.length === 0) {
			console.error(
				`No m3u8 video format at or below ${resolution} for ${video_id}.`
			);
			return { ok: false, reason: "bad_resolution" };
		}
		videoFormats.sort(
			(a, b) => (b.height as number) - (a.height as number)
		);
		// avc1 first so that native HLS players (Safari) are not handed VP9
		const videoFormat =
			videoFormats.find((format) => format.vcodec.startsWith("avc1")) ??
			videoFormats.reduce((best, format) =>
				(format.tbr ?? 0) > (best.tbr ?? 0) ? format : best
			);

		// audio itags carry no bitrate, so the track has to be chosen by its
		// language markers rather than by itag
		const audioFormat = pickOriginalAudio(
			hlsFormats.filter((format) => format.vcodec === "none")
		);
		if (!audioFormat) {
			console.error(`No m3u8 audio format for ${video_id}.`);
			return { ok: false, reason: "error" };
		}
		logVerbose(
			`Picked m3u8 audio ${audioFormat.format_id} (lang=${audioFormat.language}, note=${audioFormat.format_note}) for ${video_id}`
		);

		return {
			ok: true,
			playlists: {
				videoPlaylistUrl: videoFormat.url,
				audioPlaylistUrl: audioFormat.url,
				videoFormatId: videoFormat.format_id,
				audioFormatId: audioFormat.format_id,
				videoWidth: videoFormat.width as number,
				videoHeight: videoFormat.height as number,
				// tbr is in kbps, BANDWIDTH wants bits per second
				videoBandwidth: Math.round((videoFormat.tbr ?? 0) * 1000)
			}
		};
	} catch (error) {
		console.error(`Error in getM3u8Playlists("${video_id}"): ${error}`);
		return { ok: false, reason: "error" };
	} finally {
		const finishedAt = new Date();
		logVerbose(
			`Finished m3u8 lookup for ${video_id} at ${finishedAt.toISOString()} after ${finishedAt.getTime() - startedAt.getTime()}ms`
		);
	}
}

export async function fillVideoCache(channel_id: string) {
	const startedAt = new Date();
	console.log(
		`Starting cache fill for ${channel_id} at ${startedAt.toISOString()}`
	);

	if (channel_id[1] !== "C") {
		console.error(`Unable to convert ${channel_id} to playlist id.`);
		console.log(
			`Finished cache fill for ${channel_id} at ${new Date().toISOString()} after ${Date.now() - startedAt.getTime()}ms`
		);
		return false;
	}

	const playlist_id = "UU" + channel_id.slice(2);
	const playlist_url = playlist_root + playlist_id;
	const cacheExpiry = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	const blacklistData = await db.select().from(blacklist);
	const blacklistIds: string[] = [];
	for (const data of blacklistData) {
		blacklistIds.push(data.videoId);
	}
	try {
		const [freshCache] = await db
			.select({ cachedAt: videoCache.cachedAt })
			.from(videoCache)
			.where(
				and(
					eq(videoCache.uploaderId, channel_id),
					gt(videoCache.cachedAt, cacheExpiry)
				)
			)
			.limit(1);

		if (freshCache) {
			console.log(
				`Keeping cache for ${channel_id}; it is less than a month old`
			);
		} else {
			console.log(`Clearing cache for ${channel_id}`);
			await db
				.delete(videoCache)
				.where(eq(videoCache.uploaderId, channel_id));
		}

		const ytDlpStartedAt = new Date();
		console.log(
			`Starting yt-dlp for ${channel_id} at ${ytDlpStartedAt.toISOString()}`
		);
		let stdout: string;

		try {
			({ stdout } = await execFileAsync(
				"yt-dlp",
				[
					"--flat-playlist",
					"--extractor-args",
					"youtubetab:approximate_date",
					"--dump-single-json",
					"--no-warnings",
					playlist_url
				],
				{ maxBuffer: 64 * 1024 * 1024 }
			));
		} finally {
			const ytDlpFinishedAt = new Date();
			console.log(
				`Finished yt-dlp for ${channel_id} at ${ytDlpFinishedAt.toISOString()} after ${ytDlpFinishedAt.getTime() - ytDlpStartedAt.getTime()}ms`
			);
		}
		const jsonData = JSON.parse(stdout);
		for (const video of jsonData.entries) {
			if (video.live_status != null) {
				console.log(
					`Skipping ${video.title} since it is/was a live stream`
				);
				continue;
			}
			if (video.timestamp == null) {
				console.log(`Timestamp for ${video.title} is null. Skipping.`);
				continue;
			}
			if (blacklistIds.includes(video.id)) {
				console.log(
					`Skipping ${video.title} since it is in the blacklist`
				);
				continue;
			}
			console.log(`Inserting ${video.title}`);
			const thumbnailUrl = getThumbnailUrl(video.id);
			const entry: typeof videoCache.$inferInsert = {
				uploaderId: channel_id,
				title: sanitizeText(video.title),
				thumbnailURL: thumbnailUrl,
				videoId: video.id,
				publishedAt: new Date(video.timestamp * 1000)
			};
			await db.insert(videoCache).values(entry).onConflictDoNothing();
		}
		return true;
	} catch (error) {
		console.error(`Error in fillVideoCache("${channel_id}"): ${error}`);
		return false;
	} finally {
		const finishedAt = new Date();
		console.log(
			`Finished cache fill for ${channel_id} at ${finishedAt.toISOString()} after ${finishedAt.getTime() - startedAt.getTime()}ms`
		);
	}
}
