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
		// videoId breaks ties: yt-dlp only reports a date, so the whole table
		// has 48 distinct publishedAt values and up to 449 videos share one.
		// Without a unique second sort key the order inside a tie is arbitrary
		// and OFFSET paging repeats and skips videos.
		.orderBy(desc(videoCache.publishedAt), desc(videoCache.videoId));
	return (
		<div className="videos">
			{videos.map((video) => (
				<Video videoId={video.videoId} key={video.videoId} />
			))}
		</div>
	);
}
