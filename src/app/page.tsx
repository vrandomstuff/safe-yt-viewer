import VideoList from './videoList'

export default async function Page({
	searchParams,
}: {
	searchParams: Promise<{ page?: string | string[] }>
}) {
	const { page } = await searchParams
	const pageNum = Array.isArray(page) ? parseInt(page[0] ?? '1', 10) || 1 : parseInt(page ?? '1', 10) || 1
	return (<>
			<VideoList page={pageNum}/>
			<p>
				<a href={`/?page=${pageNum === 1 ? pageNum : pageNum - 1 }`/* this makes it go to page 1 when it is on page one*/} style={{fontSize: 50}}>&lt;- </a>
				<a href={`/?page=${pageNum + 1}`} style={{fontSize: 50}}> -&gt;</a>
			</p>
			</>
		   )
}
