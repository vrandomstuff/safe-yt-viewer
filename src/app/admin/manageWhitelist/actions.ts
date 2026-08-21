"use server";

import { videoCache, whitelist } from "@/db/schema";
import { db } from "@/instrumentation";
import { eq } from "drizzle-orm";

export async function getWhitelistRows(): Promise<
	(typeof whitelist.$inferSelect)[]
> {
	return await db.select().from(whitelist);
}
export async function getVideoFromId(videoId: string) {
	return await db
		.select()
		.from(videoCache)
		.where(eq(videoCache.videoId, videoId));
}
