import { db } from "@/instrumentation";
import { redirectIfNotAuthed } from "@/app/admin/auth/actions";
import { videoCache, whitelist } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Video } from "@/app/Video";

export default async function Page() {
	redirectIfNotAuthed();

	const whitelistRows = await db.select().from(whitelist);

	return (
		<>
			<ul
				style={{ display: "flex", flexDirection: "column", gap: "5px" }}
			>
				{whitelistRows.map(async (wVid) => {
					const videoRow = await db
						.select()
						.from(videoCache)
						.where(eq(videoCache.videoId, wVid.videoId));
					if (videoRow.length === 0) {
						return <li key={wVid.videoId}>{wVid.videoId}</li>;
					}
					return (
						<li key={wVid.videoId}>
							<Video videoId={wVid.videoId} />
						</li>
					);
				})}
			</ul>
		</>
	);
}
