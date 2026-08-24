import { blacklist, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { Video } from "@/app/Video";
import { redirectIfNotAuthed } from "@/app/admin/auth/actions";
import {
	AddToBlacklistForm,
	RemoveFromBlacklistButton
} from "./blacklistControls";
import { eq } from "drizzle-orm";

export default async function Page() {
	await redirectIfNotAuthed();

	const rows = await db
		.select({
			videoId: blacklist.videoId,
			cachedVideoId: videoCache.videoId
		})
		.from(blacklist)
		.leftJoin(videoCache, eq(blacklist.videoId, videoCache.videoId));

	return (
		<>
			<AddToBlacklistForm />
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
						<RemoveFromBlacklistButton videoId={row.videoId} />
					</li>
				))}
			</ul>
		</>
	);
}
