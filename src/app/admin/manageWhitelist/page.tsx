import { whitelist, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { Video } from "@/app/Video";
import { redirectIfNotAuthed } from "@/app/admin/auth/actions";
import {
	AddToWhitelistForm,
	RemoveFromWhitelistButton
} from "./whitelistControls";
import { eq } from "drizzle-orm";

export default async function Page() {
	await redirectIfNotAuthed();

	const rows = await db
		.select({
			videoId: whitelist.videoId,
			cachedVideoId: videoCache.videoId
		})
		.from(whitelist)
		.leftJoin(videoCache, eq(whitelist.videoId, videoCache.videoId));

	return (
		<>
			<AddToWhitelistForm />
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
						<RemoveFromWhitelistButton videoId={row.videoId} />
					</li>
				))}
			</ul>
		</>
	);
}
