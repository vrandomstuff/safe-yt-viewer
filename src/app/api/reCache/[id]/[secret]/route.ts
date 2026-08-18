import { fillVideoCache } from '../../../../../lib/channel'
import { videoCache, channels, whitelist } from '../../../../../db/schema'
import { db } from '../../../../../instrumentation'
import { eq } from 'drizzle-orm'
import 'dotenv/config';


export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string, secret: string }> }
) {
	const { id, secret } = await params;
	if(!process.env.SHARED_ADMIN_SECRET || secret !== process.env.SHARED_ADMIN_SECRET) {
		return Response.json({ "error": "no perms" })
	}
	if(id == "all") {
		await db.delete(videoCache)
		const channelList = await db.select().from(channels)
		for(const channel of channelList) {
			fillVideoCache(channel.channelId)
		}
		
		const whitelistData = await db.select().from(whitelist)
		for(const video of whitelistData) {
			
		}
		return Response.json({ "status": "working" })
	} else {
		await db.delete(videoCache).where(eq(videoCache.uploaderId, id))
		fillVideoCache(id)
	}
	return Response.json({ "status": "working"})
}
