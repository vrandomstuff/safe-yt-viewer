import YTEmbed from './embed'
import { videoCache } from '../db/schema'
import { db } from '../instrumentation'

export default async function Page() {
	const video = await db.select().from(videoCache).limit(1)
	if (video.length == 0) {
		return (
			<h1>Database is empty please report this error to the site admin.</h1>
		)
	}
	return (
		<>
		<YTEmbed id={video[0].videoId}/>
		</>
	)
}
