"use server";
import { redirectIfNotAuthed } from "@/app/admin/auth/actions";
import { videoCache, whitelist, blacklist } from "@/db/schema";
import { db } from "@/instrumentation";
import { addChannel } from "@/lib/channelManager";
import { sanitizeText } from "@/lib/sanitizeText";
import { eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getThumbnailUrl } from "./videoManager";

const execFileAsync = promisify(execFile);

export async function fillVideoCacheFromWhitelist(noOverride: boolean) {
	await redirectIfNotAuthed();
	const startedAt = new Date();
	console.log(`Starting whitelist cache fill at ${startedAt.toISOString()}`);

	const blacklistData = await db.select().from(blacklist);
	const blacklistIds: string[] = [];
	for (const data of blacklistData) {
		blacklistIds.push(data.videoId);
	}

	const whitelistData = await db.select().from(whitelist);

	const videoCacheData = await db.select().from(videoCache);
	const videoCacheIds: string[] = [];
	for (const data of videoCacheData) {
		videoCacheIds.push(data.videoId);
	}
	for (const video of whitelistData) {
		try {
			if (blacklistIds.includes(video.videoId)) {
				console.log(
					`Skipping ${video.videoId} since it is in the blacklist`
				);
				continue;
			}
			if (videoCacheIds.includes(video.videoId) && noOverride) {
				continue;
			}
			await db
				.delete(videoCache)
				.where(eq(videoCache.videoId, video.videoId));
			const { stdout } = await execFileAsync(
				"yt-dlp",
				[
					"--flat-playlist",
					"--dump-single-json",
					"--no-warnings",
					`https://www.youtube.com/watch?v=${video.videoId}`
				],
				{ maxBuffer: 64 * 1024 * 1024 }
			);
			const jsonData = JSON.parse(stdout);
			const channelData = await addChannel(jsonData.uploader_id, false);
			const thumbnail = getThumbnailUrl(video.videoId);
			const cacheEntry: typeof videoCache.$inferInsert = {
				videoId: video.videoId,
				uploaderId: channelData.channelId,
				title: sanitizeText(jsonData.title),
				thumbnailURL: thumbnail,
				publishedAt: new Date(jsonData.timestamp * 1000)
			};
			console.log(`Inserting ${jsonData.title}`);
			await db.insert(videoCache).values(cacheEntry);
		} catch (error) {
			console.error(
				`Error caching whitelist video ${video.videoId}: ${error}`
			);
		}
	} // for video of whitelistData

	const finishedAt = new Date();
	console.log(
		`Finished whitelist cache fill at ${finishedAt.toISOString()} after ${finishedAt.getTime() - startedAt.getTime()}ms`
	);
} // function

export async function addToWhitelist(videoId: string) {
	await redirectIfNotAuthed();
	const entry: typeof whitelist.$inferInsert = {
		videoId: videoId
	};
	await db.insert(whitelist).values(entry).onConflictDoNothing();
	fillVideoCacheFromWhitelist(true);
}
export async function removeFromWhitelist(videoId: string) {
	await redirectIfNotAuthed();
	await db.delete(videoCache).where(eq(videoCache.videoId, videoId));
	await db.delete(whitelist).where(eq(whitelist.videoId, videoId));
}
