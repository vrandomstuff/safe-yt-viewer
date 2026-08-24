import { videoCache, watchData } from "@/db/schema";
import { db } from "@/instrumentation";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Home from "@/app/home";

type YTEmbedProps = {
	id: string;
};

async function getOrigin() {
	const h = await headers();
	const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
	const proto = h.get("x-forwarded-proto") ?? "https";
	return `${proto}://${host}`;
}

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
		title: video[0].title
	};
	await db.insert(watchData).values(entry).onConflictDoNothing();
	const origin = await getOrigin();
	return (
		<>
			<iframe
				id="ytplayer"
				title="YouTube video player"
				src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&enablejsapi=1&origin=${origin}`}
				allow="autoplay; fullscreen"
				allowFullScreen
				style={{ border: 0, height: "100vh", width: "100vw" }}
			/>
			<Home />
		</>
	);
}
