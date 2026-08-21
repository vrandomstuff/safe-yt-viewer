"use server";
import { fillVideoCache } from "@/lib/channel";
import { videoCache, channels } from "@/db/schema";
import { db } from "@/instrumentation";
import { eq } from "drizzle-orm";
import "dotenv/config";
import { fillVideoCacheFromWhitelist } from "@/lib/whitelistManager";
export async function reCache(id: string) {
	if (id == "all") {
		await db.delete(videoCache);
		const channelList = await db.select().from(channels);
		for (const channel of channelList) {
			// fullyAllowed is false when the channel is added by whitelistManager and we do not want the whitelist to be a really weird way to add a channel
			if (channel.fullyAllowed) {
				fillVideoCache(channel.channelId);
			}
		}
		fillVideoCacheFromWhitelist();
	} else {
		await db.delete(videoCache).where(eq(videoCache.uploaderId, id));
		fillVideoCache(id);
	}
}
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string; secret: string }> }
) {
	const { id, secret } = await params;
	if (
		!process.env.SHARED_ADMIN_SECRET ||
		secret !== process.env.SHARED_ADMIN_SECRET
	) {
		return Response.json({ error: "no perms" });
	}
	reCache(id);
	return Response.json({ status: "working" });
}
