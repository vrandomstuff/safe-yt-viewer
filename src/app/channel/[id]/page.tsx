import { channels, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { desc, eq } from "drizzle-orm";
import { Video } from "@/app/Video";
import SearchBar from "@/app/searchBar";
import Home from "@/app/home";
export default async function Page({
	params,
	searchParams
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ page?: string | string[] }>;
}) {
	const { id } = await params;
	const { page } = await searchParams;
	const pageNum = Array.isArray(page)
		? parseInt(page[0] ?? "1", 10) || 1
		: parseInt(page ?? "1", 10) || 1;
	const videos = await db
		.select()
		.from(videoCache)
		.where(eq(videoCache.uploaderId, id))
		.orderBy(desc(videoCache.publishedAt))
		.limit(50)
		.offset(50 * (pageNum - 1));
	const channelRows = await db
		.select()
		.from(channels)
		.where(eq(channels.channelId, id))
		.limit(1);
	if (channelRows.length === 0) {
		throw new Error("Unable to find channel");
	}
	const channel = channelRows[0];
	return (
		<>
			<div style={{ display: "flex" }}>
				<SearchBar query="" />
				<Home />
			</div>
			<div style={{ display: "flex" }}>
				<img
					src={channel.avatarUrl}
					style={{
						borderRadius: "500px",
						width: "200px",
						height: "200px"
					}}
					// This is blank since the channel name is the next thing here.
					alt=""
				/>
				<h1>{channel.name}</h1>
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
						`/channel/${id}?page=${pageNum === 1 ? pageNum : pageNum - 1}` /* this makes it go to page 1 when it is on page one*/
					}
				>
					&lt;-{" "}
				</a>
				<a
					className="pageChangeButtons"
					href={`/channel/${id}?page=${pageNum + 1}`}
				>
					{" "}
					-&gt;
				</a>
			</p>
		</>
	);
}
