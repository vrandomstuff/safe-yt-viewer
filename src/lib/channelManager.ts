import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { avatarCache, channelMetadataCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { and, eq, gt } from "drizzle-orm";
export const execFileAsync = promisify(execFile);
export type channelData = {
	name: string;
	channelId: string;
	handle: string;
};
export const playlist_root = "https://www.youtube.com/playlist?list=";

export async function getChannelMetadata(
	handle: string
): Promise<channelData | null> {
	const cacheExpiry = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	const [freshCache] = await db
		.select({ cachedAt: channelMetadataCache.cachedAt })
		.from(channelMetadataCache)
		.where(
			and(
				eq(channelMetadataCache.handle, handle),
				gt(channelMetadataCache.cachedAt, cacheExpiry)
			)
		)
		.limit(1);

	if (freshCache) {
		const [cacheEntry] = await db
			.select()
			.from(channelMetadataCache)
			.where(eq(channelMetadataCache.handle, handle));
		if (!cacheEntry) {
			throw new Error(
				"So there was a channel in the channelMetadataCache we checked it but now that we are getting the metadata it is gone."
			);
		}
		return {
			channelId: cacheEntry.channelId,
			name: cacheEntry.name,
			handle: cacheEntry.handle
		};
	} else {
		console.log(`Clearing channelMetadataCache for ${handle}`);
		await db
			.delete(channelMetadataCache)
			.where(eq(channelMetadataCache.handle, handle));
	}
	try {
		const { stdout } = await execFileAsync(
			"yt-dlp",
			[
				"--flat-playlist",
				"--dump-single-json",
				"--no-warnings",
				`https://www.youtube.com/${handle}`
			],
			{ maxBuffer: 64 * 1024 * 1024 }
		);
		const jsonData = JSON.parse(stdout);
		const metadata: channelData = {
			channelId: jsonData.channel_id,
			name: jsonData.channel,
			handle: jsonData.id
		};
		const entry: typeof channelMetadataCache.$inferInsert = {
			handle: handle,
			channelId: metadata.channelId,
			name: metadata.name
		};
		await db.insert(channelMetadataCache).values(entry);
		return metadata;
	} catch (error) {
		console.error(`Error in getChannelMetadata("${handle}"): ${error}`);
		return null;
	}
}
export async function getChannelAvatar(
	channelId: string
): Promise<string | null> {
	const cacheExpiry = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	const [freshCache] = await db
		.select({ cachedAt: avatarCache.cachedAt })
		.from(avatarCache)
		.where(
			and(
				eq(avatarCache.channelId, channelId),
				gt(avatarCache.cachedAt, cacheExpiry)
			)
		)
		.limit(1);

	if (freshCache) {
		const cacheEntry = await db
			.select()
			.from(avatarCache)
			.where(eq(avatarCache.channelId, channelId));
		if (cacheEntry.length === 0) {
			throw new Error(
				"So there was a avatar in the avatar cache we checked it but now that we are getting the avatar it is gone."
			);
		}
		return cacheEntry[0].avatarUrl;
	} else {
		console.log(`Clearing avatarCache for ${channelId}`);
		await db
			.delete(avatarCache)
			.where(eq(avatarCache.channelId, channelId));
	}
	try {
		const { stdout } = await execFileAsync(
			"yt-dlp",
			[
				"--flat-playlist",
				"--dump-single-json",
				"--no-warnings",
				`https://www.youtube.com/channel/${channelId}`
			],
			{ maxBuffer: 64 * 1024 * 1024 }
		);
		const jsonData = JSON.parse(stdout);
		const avatar = jsonData.thumbnails?.find(
			(t: { id?: string }) => t.id === "avatar_uncropped"
		);
		const entry: typeof avatarCache.$inferInsert = {
			channelId: channelId,
			avatarUrl: avatar.url
		};
		await db.insert(avatarCache).values(entry);
		return avatar?.url ?? null;
	} catch (error) {
		console.error(`Error in getChannelAvatar("${channelId}"): ${error}`);
		return null;
	}
}
