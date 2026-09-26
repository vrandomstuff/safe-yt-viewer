import { channels, contains, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { desc, eq } from "drizzle-orm";
import "dotenv/config";

const pageSize = 50;

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type"
};

export type SearchResult = {
	id: string;
	thumbnail: string;
	channel: string;
	channelAvatar: string;
	channelName: string;
	title: string;
};

export async function GET(request: Request) {
	const searchParams = new URL(request.url).searchParams;
	const query = searchParams.get("q") ?? "";
	const requestedPage = searchParams.get("page");
	const page = requestedPage === null ? 1 : Number(requestedPage);

	if (query.trim() === "" || !Number.isInteger(page) || page < 1) {
		return Response.json(
			{ error: "invalid_request" },
			{ status: 400, headers: corsHeaders }
		);
	}

	const results = await db
		.select({
			id: videoCache.videoId,
			thumbnail: videoCache.thumbnailURL,
			channel: channels.channelId,
			channelAvatar: channels.avatarUrl,
			channelName: channels.name,
			title: videoCache.title
		})
		.from(videoCache)
		.innerJoin(channels, eq(channels.channelId, videoCache.uploaderId))
		.where(contains(videoCache.title, query))
		// videoId is the tiebreaker on purpose: yt-dlp only yields a date, so
		// there are just 48 distinct publishedAt values across the whole table
		// (up to 449 videos share one). Without a unique second sort key the
		// row order inside a tie is arbitrary and OFFSET paging returns
		// duplicates and skips rows.
		.orderBy(desc(videoCache.publishedAt), desc(videoCache.videoId))
		.limit(pageSize)
		.offset(pageSize * (page - 1));

	return Response.json(results, { headers: corsHeaders });
}

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: corsHeaders });
}
