import { pins } from "@/db/schema";
import { db } from "@/instrumentation";
import { Video } from "@/app/Video";
import SearchBar from "@/app/searchBar";
import Home from "@/app/home";
export default async function Page({
	searchParams
}: {
	searchParams: Promise<{ page?: string | string[] }>;
}) {
	const { page } = await searchParams;
	const pageNum = Array.isArray(page)
		? parseInt(page[0] ?? "1", 10) || 1
		: parseInt(page ?? "1", 10) || 1;
	const pinRows = await db
		.select()
		.from(pins)
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
				<a
					className="pageChangeButtons"
					href={
						`/pins?page=${pageNum === 1 ? pageNum : pageNum - 1}` /* this makes it go to page 1 when it is on page one*/
					}
				>
					&lt;-{" "}
				</a>
				<a
					className="pageChangeButtons"
					href={`/pins?page=${pageNum + 1}`}
				>
					{" "}
					-&gt;
				</a>
			</p>
		</>
	);
}
