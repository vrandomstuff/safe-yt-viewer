import SearchBar from "@/app/searchBar";
import VideoList from "@/app/videoList";
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
	return (
		<>
			<div style={{ display: "flex" }}>
				<SearchBar query="" />
				<Link href={"/pins"}>
					<img
						style={{
							msTransform: "rotate(40deg)",
							WebkitTransform: "rotate(40deg)",
							transform: "rotate(40deg)"
						}}
						alt="View pinned videos"
						src={`${process.env.NEXT_PUBLIC_BASEDIR}/keep.png`}
					/>
				</Link>
			</div>
			<VideoList page={pageNum} />
			<p>
				<Link
					className="pageChangeButtons"
					href={
						`/?page=${pageNum === 1 ? pageNum : pageNum - 1}` /* this makes it go to page 1 when it is on page one*/
					}
				>
					&lt;-{" "}
				</Link>
				<Link
					className="pageChangeButtons"
					href={`/?page=${pageNum + 1}`}
				>
					{" "}
					-&gt;
				</Link>
			</p>
		</>
	);
}
