import SearchBar from "./searchBar";
import VideoList from "./videoList";

export default async function Page({
	searchParams,
}: {
	searchParams: Promise<{ page?: string | string[] }>;
}) {
	const { page } = await searchParams;
	const pageNum = Array.isArray(page)
		? parseInt(page[0] ?? "1", 10) || 1
		: parseInt(page ?? "1", 10) || 1;
	return (
		<>
			<SearchBar query="" />
			<VideoList page={pageNum} />
			<p>
				<a
					className="pageChangeButtons"
					href={
						`/?page=${pageNum === 1 ? pageNum : pageNum - 1}` /* this makes it go to page 1 when it is on page one*/
					}
				>
					&lt;-{" "}
				</a>
				<a className="pageChangeButtons" href={`/?page=${pageNum + 1}`}>
					{" "}
					-&gt;
				</a>
			</p>
		</>
	);
}
