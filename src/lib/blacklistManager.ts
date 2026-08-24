"use server";
import { redirectIfNotAuthed } from "@/app/admin/auth/actions";
import { blacklist, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { eq } from "drizzle-orm";

export async function removeFromBlacklist(videoId: string) {
	await redirectIfNotAuthed();
	await db.delete(blacklist).where(eq(blacklist.videoId, videoId));
}
export async function addToBlacklist(videoId: string) {
	await redirectIfNotAuthed();
	const entry: typeof blacklist.$inferInsert = {
		videoId: videoId
	};
	await db.delete(videoCache).where(eq(videoCache.videoId, videoId));
	await db.insert(blacklist).values(entry);
}
