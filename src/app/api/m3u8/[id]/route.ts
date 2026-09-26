import { getM3u8Playlists, type M3u8Playlists } from "@/lib/videoManager";
import "dotenv/config";

const defaultResolution = 1080;

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type"
};

const statusForReason: Record<string, number> = {
	invalid_request: 400,
	bad_resolution: 400,
	not_cached: 403,
	error: 500
};

// CODECS is omitted on purpose: yt-dlp reports no acodec for the m3u8 audio
// itags, so there is no trustworthy RFC 6381 string to advertise
function buildMasterPlaylist(playlists: M3u8Playlists): string {
	return [
		"#EXTM3U",
		"#EXT-X-VERSION:4",
		`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="${playlists.audioPlaylistUrl}"`,
		`#EXT-X-STREAM-INF:BANDWIDTH=${playlists.videoBandwidth},RESOLUTION=${playlists.videoWidth}x${playlists.videoHeight},AUDIO="audio"`,
		playlists.videoPlaylistUrl,
		""
	].join("\n");
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id } = await params;
	const requested = new URL(request.url).searchParams.get("resolution");
	const resolution =
		requested === null ? defaultResolution : Number(requested);

	const result = await getM3u8Playlists(id, resolution);
	if (!result.ok) {
		return Response.json(
			{ error: result.reason },
			{
				status: statusForReason[result.reason] ?? 500,
				headers: corsHeaders
			}
		);
	}

	return new Response(buildMasterPlaylist(result.playlists), {
		status: 200,
		headers: {
			...corsHeaders,
			"Content-Type": "application/vnd.apple.mpegurl"
		}
	});
}

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: corsHeaders });
}
