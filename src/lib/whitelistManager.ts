import { channels, videoCache, whitelist, blacklist } from "@/db/schema";
import { db } from "@/instrumentation";
import { execFileAsync, getChannelAvatar, getChannelMetadata, getThumbnailUrl } from "@/lib/channel"
import { eq } from "drizzle-orm";

export async function fillVideoCacheFromWhitelist() {
	const startedAt = new Date()
	console.log(`Starting whitelist cache fill at ${startedAt.toISOString()}`)

	const blacklistData = await db.select().from(blacklist)
	const blacklistIds: string[] = []
	for (const data of blacklistData) {
		blacklistIds.push(data.videoId)
	}

	const whitelistData = await db.select().from(whitelist)
	for(const video of whitelistData) {
		try {
			if(blacklistIds.includes(video.videoId)) {
				console.log(`Skipping ${video.videoId} since it is in the blacklist`)
				continue
			}
			await db.delete(videoCache).where(eq(videoCache.videoId, video.videoId))
			const { stdout } = await execFileAsync(
				'yt-dlp',
				[
					'--flat-playlist',
					'--dump-single-json',
					'--no-warnings',
					`https://www.youtube.com/watch?v=${video.videoId}`,
				],
				{ maxBuffer: 64 * 1024 * 1024 },
			)
			const jsonData = JSON.parse(stdout)
			const channelData = await getChannelMetadata(jsonData.uploader_id)
			if(channelData == null) {
				console.error(`channelData for ${jsonData.uploader_id} is null, skipping`)
				continue
			}
			const channelAvatar = await getChannelAvatar(channelData.channelId)
			if(channelAvatar == null) {
				console.error(`channelAvatar for ${jsonData.uploader_id} is null, skipping`)
				continue
			}
			const channelEntry: typeof channels.$inferInsert = {
				name: channelData.name,
				channelId: channelData.channelId,
				handle: channelData.handle,
				avatarUrl: channelAvatar,
				fullyAllowed: false
			}
			await db.insert(channels).values(channelEntry).onConflictDoNothing()
			const thumbnail = getThumbnailUrl(video.videoId)
			const cacheEntry: typeof videoCache.$inferInsert = {
				videoId: video.videoId,
				uploaderId: channelData.channelId,
				title: jsonData.title,
				thumbnailURL: thumbnail,
				publishedAt: new Date(jsonData.timestamp * 1000)
			}
			console.log(`Inserting ${jsonData.title}`)
			await db.insert(videoCache).values(cacheEntry)
		} catch (error) {
			console.error(`Error caching whitelist video ${video.videoId}: ${error}`)
		}
	} // for video of whitelistData

	const finishedAt = new Date()
	console.log(`Finished whitelist cache fill at ${finishedAt.toISOString()} after ${finishedAt.getTime() - startedAt.getTime()}ms`)
} // function
