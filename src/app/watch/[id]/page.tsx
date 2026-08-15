import YTEmbed from '../../embed'
import { videoCache, blacklist, whitelist } from '../../../db/schema'
import { db } from '../../../instrumentation'
import { eq } from 'drizzle-orm'
export default async function Page({ params }: PageProps<"/watch/[id]">) {
	const { id } = await params
	const cacheEntry = await db.select().from(videoCache).where(eq(videoCache.videoId, id))
	const blacklistEntry = await db.select().from(blacklist).where(eq(blacklist.videoId, id))
	const whitelistEntry = await db.select().from(whitelist).where(eq(whitelist.videoId, id))
	if(cacheEntry.length === 0 && whitelistEntry.length === 0 || blacklistEntry.length != 0) {
		return (
			<h1>Video is not allowed</h1>
		)
	}
	return (
		<>
			<YTEmbed id={id}/>
		</>
	)
}
