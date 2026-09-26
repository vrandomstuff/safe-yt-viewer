import { decodeProxyToken, rewritePlaylist } from "@/lib/hlsProxy";
import "dotenv/config";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type"
};

type ProxyReason = "invalid_request" | "upstream_error";

const statusForReason: Record<ProxyReason, number> = {
	invalid_request: 400,
	upstream_error: 502
};

// Google labels its playlists, but the type is not contractually guaranteed, so
// the .m3u8 path is checked as well. Everything else is a media segment.
const playlistContentTypes = [
	"application/vnd.apple.mpegurl",
	"application/x-mpegurl",
	"audio/mpegurl"
];

const passedThroughHeaders = [
	"accept-ranges",
	"cache-control",
	"content-length",
	"content-type",
	"etag",
	"last-modified"
];

function failure(reason: ProxyReason) {
	return Response.json(
		{ error: reason },
		{ status: statusForReason[reason], headers: corsHeaders }
	);
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string; token: string }> }
) {
	const { id, token } = await params;

	// The id is part of the signed message, so a token minted for one video
	// fails here rather than being replayed to fetch another video's segments.
	const url = /^[a-zA-Z0-9_-]{11}$/.test(id)
		? decodeProxyToken(id, token)
		: null;
	if (url === null) {
		return failure("invalid_request");
	}

	let upstream: Response;
	try {
		upstream = await fetch(url, {
			headers: {
				// identity because fetch would otherwise transparently inflate a
				// body whose content-length and content-encoding then lie
				"Accept-Encoding": "identity"
			}
		});
	} catch (error) {
		console.error(`Error proxying ${url}: ${error}`);
		return failure("upstream_error");
	}
	if (!upstream.ok) {
		console.error(`Upstream ${url} answered ${upstream.status}.`);
		return failure("upstream_error");
	}

	const contentType = upstream.headers.get("content-type") ?? "";
	if (
		playlistContentTypes.some((type) => contentType.includes(type)) ||
		new URL(url).pathname.endsWith(".m3u8")
	) {
		// A playlist is a few hundred kB of text whose every URI has to come
		// back through here as well, or the browser hits the same CORS wall
		// again on the segments.
		return new Response(rewritePlaylist(await upstream.text(), id), {
			status: 200,
			headers: {
				...corsHeaders,
				"Content-Type": "application/vnd.apple.mpegurl"
			}
		});
	}

	// googlevideo ignores Range on HLS chunks and answers 200 with the whole
	// segment, so the body is streamed on through as it arrives rather than
	// buffered.
	const headers = new Headers(corsHeaders);
	for (const name of passedThroughHeaders) {
		const value = upstream.headers.get(name);
		if (value !== null) {
			headers.set(name, value);
		}
	}
	return new Response(upstream.body, { status: upstream.status, headers });
}

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: corsHeaders });
}
