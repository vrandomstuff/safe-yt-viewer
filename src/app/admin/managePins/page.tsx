import { pins, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { Video } from "@/app/Video";
import { redirectIfNotAuthed } from "@/app/admin/auth/actions";
import { AddToPinsForm, RemoveFromPinsButton } from "./pinControls";
import { eq } from "drizzle-orm";

export default async function Page() {
	await redirectIfNotAuthed();

	const rows = await db
		.select({
			videoId: pins.videoId,
			cachedVideoId: videoCache.videoId
		})
		.from(pins)
		.leftJoin(videoCache, eq(pins.videoId, videoCache.videoId));

	return (
		<>
			<AddToPinsForm />
			<ul
				style={{ display: "flex", flexDirection: "column", gap: "5px" }}
			>
				{rows.map((row) => (
					<li key={row.videoId}>
						{row.cachedVideoId === null ? (
							row.videoId
						) : (
							<Video videoId={row.videoId} />
						)}
						<RemoveFromPinsButton videoId={row.videoId} />
					</li>
				))}
			</ul>
		</>
	);
}
