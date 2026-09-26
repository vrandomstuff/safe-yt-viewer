import { createHmac, timingSafeEqual } from "node:crypto";

// Google's video CDN answers with `Vary: Origin` and only echoes
// `Access-Control-Allow-Origin` for YouTube's own origins, so a browser can
// read neither a googlevideo playlist nor a googlevideo segment from this
// app's origin. Every HLS client loads those with XHR, which is always a CORS
// request, so there is nothing the player can be told to do differently: the
// bytes have to come from our own origin. Hence the proxy route, which fetches
// them server side where there is no Origin to check, and rewrites playlists so
// that the segments they point at come back through here too.
//
// googlevideo URLs run to well over a thousand characters, so they travel as a
// token: the base64url target, then an HMAC over the video id and the target.
// The signature is what lets the route trust a token without a database round
// trip per segment, and it means a token can only exist if the m3u8 route minted
// one, which is where the videoCache check lives.

// Domain separation, so this key is never interchangeable with the admin
// secret's other uses. The video id is inside the signed message as well, which
// stops a token minted for one video being replayed under another id.
const signatureDomain = "safe-yt-viewer/hls-proxy/v1";

function sign(video_id: string, url: string): string {
	const secret = process.env.SHARED_ADMIN_SECRET;
	if (secret === undefined) {
		throw new Error("SHARED_ADMIN_SECRET not found.");
	}
	return createHmac("sha256", secret)
		.update(`${signatureDomain}\n${video_id}\n${url}`)
		.digest("base64url");
}

// Without this the route is an SSRF relay into whatever else the server can
// reach. Everything the player legitimately needs is on googlevideo, and
// Google's own player pages are not, so the allowlist stays narrow.
function isUpstreamUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	const host = parsed.hostname.toLowerCase();
	return (
		parsed.protocol === "https:" &&
		parsed.port === "" &&
		(host === "googlevideo.com" || host.endsWith(".googlevideo.com"))
	);
}

export function proxyUrl(video_id: string, url: string): string {
	const token = `${Buffer.from(url, "utf8").toString("base64url")}.${sign(video_id, url)}`;
	return `${process.env.NEXT_PUBLIC_BASEDIR ?? ""}/api/m3u8/${video_id}/proxy/${token}`;
}

export function decodeProxyToken(
	video_id: string,
	token: string
): string | null {
	const separator = token.indexOf(".");
	if (separator < 1) {
		return null;
	}
	const url = Buffer.from(token.slice(0, separator), "base64url").toString(
		"utf8"
	);
	if (!isUpstreamUrl(url)) {
		return null;
	}
	const expected = Buffer.from(sign(video_id, url), "utf8");
	const actual = Buffer.from(token.slice(separator + 1), "utf8");
	if (
		expected.length !== actual.length ||
		!timingSafeEqual(expected, actual)
	) {
		return null;
	}
	return url;
}

// Playlist URIs come in two shapes: a bare line of its own, and a URI="..."
// attribute on a tag (EXT-X-MEDIA, EXT-X-MAP, EXT-X-KEY, ...). Both need
// rewriting, and anything that is not an absolute googlevideo URL is left
// exactly as it was rather than guessed at.
const uriAttribute = /URI="([^"]*)"/g;

export function rewritePlaylist(playlist: string, video_id: string): string {
	return playlist
		.split("\n")
		.map((line) => {
			const carriageReturn = line.endsWith("\r") ? "\r" : "";
			const trimmed = carriageReturn ? line.slice(0, -1) : line;
			if (trimmed === "") {
				return line;
			}
			if (trimmed.startsWith("#")) {
				const rewritten = trimmed.replace(
					uriAttribute,
					(match, uri: string) =>
						isUpstreamUrl(uri)
							? `URI="${proxyUrl(video_id, uri)}"`
							: match
				);
				return rewritten + carriageReturn;
			}
			return isUpstreamUrl(trimmed)
				? proxyUrl(video_id, trimmed) + carriageReturn
				: line;
		})
		.join("\n");
}
