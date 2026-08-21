import { db } from "@/instrumentation";
import { redirectIfNotAuthed } from "../auth/actions";
import { videoCache, whitelist } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function Page() {
	redirectIfNotAuthed();
	const whitelistRows = await db.select().from(whitelist);

	return (
		<>
			<ul>
				{whitelistRows.map(async (wVid) => {
					const videoRow = await db
						.select()
						.from(videoCache)
						.where(eq(videoCache.videoId, wVid.videoId));
					if (videoRow.length === 0) {
						return <li key={wVid.videoId}>{wVid.videoId}</li>;
					}
					const video = videoRow[0];
					return (
						<li key={wVid.videoId}>
							<img
								src={video.thumbnailURL}
								alt={`Thumbnail for the video: ${video.title}`}
								crossOrigin="anonymous"
							/>
						</li>
					);
				})}
			</ul>
		</>
	);
}
