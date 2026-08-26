import { contains, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { desc } from "drizzle-orm";
import { Video } from "@/app/Video";
import SearchBar from "@/app/searchBar";
import Home from "@/app/home";
import Link from "next/link";
export default async function Page({
	params,
	searchParams
}: {
	params: Promise<{ queryUri: string }>;
	searchParams: Promise<{ page?: string | string[] }>;
}) {
	const { queryUri } = await params;
	const { page } = await searchParams;
	const query = decodeURIComponent(queryUri);
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
	const videos = await db
		.select()
		.from(videoCache)
		.where(contains(videoCache.title, query))
		.orderBy(desc(videoCache.publishedAt))
		.limit(50)
		.offset(50 * (pageNum - 1));
	return (
		<>
			<div style={{ display: "flex" }}>
				<SearchBar query={query} />
				<Home />
			</div>
			<div className="videos">
				{videos.map((video) => (
					<Video videoId={video.videoId} key={video.videoId} />
				))}
			</div>
			<p>
				<a
					className="pageChangeButtons"
					href={
						`/search/${encodeURIComponent(query)}?page=${pageNum === 1 ? pageNum : pageNum - 1}` /* this makes it go to page 1 when it is on page one*/
					}
				>
					&lt;-{" "}
				</a>
				<a
					className="pageChangeButtons"
					href={`/search/${encodeURIComponent(query)}?page=${pageNum + 1}`}
				>
					{" "}
					-&gt;
				</a>
			</p>
		</>
	);
}
