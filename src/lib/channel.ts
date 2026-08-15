import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { videoCache, blacklist } from '../db/schema'
import { db } from '../instrumentation'
import { and, eq, gt } from 'drizzle-orm'
const execFileAsync = promisify(execFile)

export const playlist_root = 'https://www.youtube.com/playlist?list='

function getThumbnailUrl(video_id: string): string {
	return `https://i.ytimg.com/vi/${video_id}/maxresdefault.jpg`;	
}

export async function getChannelAvatar(channelId: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(
			'yt-dlp',
			[
				'--flat-playlist',
				'--dump-single-json',
				'--no-warnings',
				`https://www.youtube.com/channel/${channelId}`,
			],
			{ maxBuffer: 64 * 1024 * 1024 },
		)
		const jsonData = JSON.parse(stdout)
		const avatar = jsonData.thumbnails?.find((t: { id?: string }) => t.id === 'avatar_uncropped')
		return avatar?.url ?? null
	} catch (error) {
		console.error(`Error in getChannelAvatar("${channelId}"): ${error}`)
		return null
	}
}
export async function fillVideoCache(channel_id: string) {
	const startedAt = new Date()
	console.log(`Starting cache fill for ${channel_id} at ${startedAt.toISOString()}`)

	if (channel_id[1] !== 'C') {
		console.error(`Unable to convert ${channel_id} to playlist id.`)
		console.log(`Finished cache fill for ${channel_id} at ${new Date().toISOString()} after ${Date.now() - startedAt.getTime()}ms`)
		return false
	}

	const playlist_id = 'UU' + channel_id.slice(2)
	const playlist_url = playlist_root + playlist_id
	const cacheExpiry = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
	const blacklistData = await db.select().from(blacklist);
	const blacklistIds: string[] = []
	for (const data of blacklistData) {
		blacklistIds.push(data.videoId)
	}
	try {
		const [freshCache] = await db
			.select({ cachedAt: videoCache.cachedAt })
			.from(videoCache)
			.where(and(
				eq(videoCache.uploaderId, channel_id),
				gt(videoCache.cachedAt, cacheExpiry),
			))
			.limit(1)

		if (freshCache) {
			console.log(`Keeping cache for ${channel_id}; it is less than a month old`)
		} else {
			console.log(`Clearing cache for ${channel_id}`)
			await db.delete(videoCache).where(eq(videoCache.uploaderId, channel_id))
		}

		const ytDlpStartedAt = new Date()
		console.log(`Starting yt-dlp for ${channel_id} at ${ytDlpStartedAt.toISOString()}`)
		let stdout: string
		try {
			({ stdout } = await execFileAsync(
				'yt-dlp',
				[
					'--flat-playlist',
					'--extractor-args', 'youtubetab:approximate_date',
					'--dump-single-json',
					'--no-warnings',
					playlist_url,
				],
				{ maxBuffer: 64 * 1024 * 1024 },
			))
		} finally {
			const ytDlpFinishedAt = new Date()
			console.log(`Finished yt-dlp for ${channel_id} at ${ytDlpFinishedAt.toISOString()} after ${ytDlpFinishedAt.getTime() - ytDlpStartedAt.getTime()}ms`)
		}
		const jsonData = JSON.parse(stdout)
		for (const video of jsonData.entries) {
			if(video.live_status != null) {
				console.log(`Skipping ${video.title} since it is/was a live stream`)
				continue
			}
			if(video.timestamp == null) {
				console.log(`Timestamp for ${video.title} is null. Skipping.`)
				continue;
			}
			if(blacklistIds.includes(video.id)) {
				console.log(`Skipping ${video.title} since it is in the blacklist`)
				continue;
			}
			console.log(`Inserting ${video.title}`)
			const thumbnailUrl = getThumbnailUrl(video.id)
			const entry: typeof videoCache.$inferInsert = {
				uploaderId: channel_id,
				title: video.title,
				thumbnailURL: thumbnailUrl,
				videoId: video.id,
				publishedAt: new Date(video.timestamp * 1000)
			}
			await db.insert(videoCache).values(entry).onConflictDoNothing()
		}
		return true
	} catch (error) {
		console.error(`Error in fillVideoCache("${channel_id}"): ${error}`)
		return false
	} finally {
		const finishedAt = new Date()
		console.log(`Finished cache fill for ${channel_id} at ${finishedAt.toISOString()} after ${finishedAt.getTime() - startedAt.getTime()}ms`)
	}
	
}
