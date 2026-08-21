import { videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { desc } from "drizzle-orm";
import { Video } from "@/app/Video";

type pageType = {
	page: number;
};

export default async function VideoList({ page }: pageType) {
	const videos = await db
		.select()
		.from(videoCache)
		.limit(50)
		.offset(50 * (page - 1))
		.orderBy(desc(videoCache.publishedAt));
	return (
		<div className="videos">
			{videos.map((video) => (
				<Video videoId={video.videoId} key={video.videoId} />
			))}
		</div>
	);
}
