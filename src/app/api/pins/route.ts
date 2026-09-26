import { channels, pins, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import type { VideoListEntry } from "@/lib/videoListEntry";
import { desc, eq } from "drizzle-orm";
import "dotenv/config";

const pageSize = 50;

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type"
};

export async function GET(request: Request) {
	const searchParams = new URL(request.url).searchParams;
	const requestedPage = searchParams.get("page");
	const page = requestedPage === null ? 1 : Number(requestedPage);

	if (!Number.isInteger(page) || page < 1) {
		return Response.json(
			{ error: "invalid_request" },
			{ status: 400, headers: corsHeaders }
		);
	}

	// Joining through videoCache is deliberate: a pin whose video is no longer
	// cached (blacklisted, or dropped by a reCache) has no title, thumbnail or
	// channel to report, so it is left out rather than returned half-empty.
	const results: VideoListEntry[] = await db
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
		.innerJoin(pins, eq(videoCache.videoId, pins.videoId))
		// videoId is the tiebreaker for the same reason as in every other list
		// route: publishedAt has far too few distinct values to order by on its
		// own, so without a unique second sort key OFFSET paging returns
		// duplicates and skips rows. Both joins are on a primary key, so
		// videoId is still unique in this result.
		.orderBy(desc(videoCache.publishedAt), desc(videoCache.videoId))
		.limit(pageSize)
		.offset(pageSize * (page - 1));

	return Response.json(results, { headers: corsHeaders });
}

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: corsHeaders });
}
