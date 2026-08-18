import { channels, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { desc } from "drizzle-orm";

type pageType = {
	page: number
}

export default async function VideoList({ page }: pageType ) {
	const videos = await db.select().from(videoCache)
		.limit(50)
		.offset(50 * (page - 1))
		.orderBy(desc(videoCache.publishedAt));
	const channelList = await db.select().from(channels)
	const channelById = new Map(channelList.map(c => [c.channelId, c]))
	return (
		<div className="videos">
		{videos.map(video => {
			const channel = channelById.get(video.uploaderId)
			return (
				<a key={video.videoId} className="" href={`/watch/${video.videoId}`}>
					<img src={video.thumbnailURL} alt={`Thumbnail for the video: ${video.title}`} crossOrigin="anonymous"/>
					<br/>
					{video.title}
					<br/>
					<a href={`/channel/${channel?.channelId}`}> {/*TODO: /channel page to show the videos for one channel*/}
						<img
							style = {{
								width: '50px',
								height: '50px',
								backgroundColor: 'transparent',
								borderRadius: '50px' // there is no transpaency on the avatar image even though it is a png so i have to do this to make it a circle
							}}
							alt={channel?.name}
							src={channel?.avatarUrl}
							title={channel?.name}/>
					</a>
					<br/>
				</a>

			)
		})}
		</div>
	)
}
