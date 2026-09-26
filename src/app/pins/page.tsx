import { pins, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { desc, eq } from "drizzle-orm";
import { Video } from "@/app/Video";
import SearchBar from "@/app/searchBar";
import Home from "@/app/home";
import Link from "next/link";
export default async function Page({
	searchParams
}: {
	searchParams: Promise<{ page?: string | string[] }>;
}) {
	const { page } = await searchParams;
	const pageNum = Array.isArray(page)
		? parseInt(page[0] ?? "1", 10) || 1
		: parseInt(page ?? "1", 10) || 1;
	if (pageNum < 0) {
		return (
			<h1>
				Invalid page.{" "}
				<Link style={{ color: "blueviolet" }} href="/">
					Press here to go home.
				</Link>
			</h1>
		);
	}
	// Joining through videoCache on purpose: the Video component renders a
	// bare video id for anything that is not cached, so a pin left behind by a
	// blacklisting or a reCache would show up as a page of ids instead of
	// dropping out, as it does from /api/pins.
	const pinRows = await db
		.select({ videoId: videoCache.videoId })
		.from(videoCache)
		.innerJoin(pins, eq(videoCache.videoId, pins.videoId))
		// videoId is the tiebreaker for the same reason as in every other list:
		// publishedAt has far too few distinct values to page by on its own, and
		// without a unique second sort key OFFSET paging returns duplicates and
		// skips rows.
		.orderBy(desc(videoCache.publishedAt), desc(videoCache.videoId))
		.limit(50)
		.offset(50 * (pageNum - 1));
	return (
		<>
			<div style={{ display: "flex" }}>
				<SearchBar query="" />
				<Home />
			</div>
			<div className="videos">
				{pinRows.map((pin) => (
					<Video videoId={pin.videoId} key={pin.videoId} />
				))}
			</div>
			<p>
				<Link
					className="pageChangeButtons"
					href={
						`/pins?page=${pageNum === 1 ? pageNum : pageNum - 1}` /* this makes it go to page 1 when it is on page one*/
					}
				>
					&lt;-{" "}
				</Link>
				<Link
					className="pageChangeButtons"
					href={`/pins?page=${pageNum + 1}`}
				>
					{" "}
					-&gt;
				</Link>
			</p>
		</>
	);
}
