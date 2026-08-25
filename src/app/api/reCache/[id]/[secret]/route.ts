"use server";
import { fillVideoCache } from "@/lib/videoManager";
import { videoCache, channels, tokens } from "@/db/schema";
import { db } from "@/instrumentation";
import { eq } from "drizzle-orm";
import "dotenv/config";
import { fillVideoCacheFromWhitelist } from "@/lib/whitelistManager";
export async function reCache(id: string, secret: string) {
	const maybeDbEntrySecret = await db
		.select()
		.from(tokens)
		.where(eq(tokens.token, secret));
	if (
		secret !== process.env.SHARED_ADMIN_SECRET &&
		maybeDbEntrySecret.length === 0
	) {
		return;
	}
	if (id == "all") {
		await db.delete(videoCache);
		const channelList = await db.select().from(channels);
		for (const channel of channelList) {
			// fullyAllowed is false when the channel is added by whitelistManager and we do not want the whitelist to be a really weird way to add a channel
			if (channel.fullyAllowed) {
				fillVideoCache(channel.channelId);
			}
		}
		fillVideoCacheFromWhitelist(false);
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
	if (secret !== process.env.SHARED_ADMIN_SECRET) {
		return Response.json({ error: "no perms" });
	}
	reCache(id, secret);
	return Response.json({ status: "working" });
}
