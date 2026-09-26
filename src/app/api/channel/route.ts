import { channels, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import type { VideoListEntry } from "@/lib/videoListEntry";
import { desc, eq } from "drizzle-orm";
import "dotenv/config";

const pageSize = 50;

// A channel ID is UC plus 22 more characters, which is also the width of
// channels.channelId. Validating it here is what keeps a typo, a truncated id
// or a forgotten query parameter from paging over an empty result that is
// indistinguishable from "this channel has no cached videos".
const channelIdPattern = /^UC[A-Za-z0-9_-]{22}$/;

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type"
};

export async function GET(request: Request) {
	const searchParams = new URL(request.url).searchParams;
	const channel = searchParams.get("channel") ?? "";
	const requestedPage = searchParams.get("page");
	const page = requestedPage === null ? 1 : Number(requestedPage);

	if (
		!channelIdPattern.test(channel) ||
		!Number.isInteger(page) ||
		page < 1
	) {
		return Response.json(
			{ error: "invalid_request" },
			{ status: 400, headers: corsHeaders }
		);
	}

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
		.where(eq(videoCache.uploaderId, channel))
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
