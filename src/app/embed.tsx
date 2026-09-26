import { videoCache, watchData } from "@/db/schema";
import { db } from "@/instrumentation";
import { sanitizeText } from "@/lib/sanitizeText";
import { eq } from "drizzle-orm";
import Home from "@/app/home";
import HLSPlayer from "./hlsPlayer";

type YTEmbedProps = {
	id: string;
};

export default async function YTEmbed({ id }: YTEmbedProps) {
	const video = await db
		.select()
		.from(videoCache)
		.where(eq(videoCache.videoId, id))
		.limit(1);
	if (video.length !== 1) {
		return (
			<>
				<h1>Video is not allowed.</h1>
			</>
		);
	}
	const entry: typeof watchData.$inferInsert = {
		videoId: id,
		title: sanitizeText(video[0].title)
	};
	const m3u8 = `${process.env.NEXT_PUBLIC_BASEDIR}/api/m3u8/${id}`;
	await db.insert(watchData).values(entry).onConflictDoNothing();
	return (
		<>
			<HLSPlayer src={m3u8} />
			<Home />
		</>
	);
}
