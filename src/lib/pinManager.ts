import { pins } from "@/db/schema";
import { db } from "@/instrumentation";
import { eq } from "drizzle-orm";

export async function addToPins(videoId: string) {
	const entry: typeof pins.$inferInsert = {
		videoId: videoId
	};
	await db.insert(pins).values(entry);
}
export async function removeFromPins(videoId: string) {
	await db.delete(pins).where(eq(pins.videoId, videoId));
}
