# API

All routes are served from the same origin as the app, with no version prefix.

## Conventions

- **Base URL** — `http://<host>:<port>`, e.g. `http://localhost:3000` in development.
- **CORS** — every route returns `Access-Control-Allow-Origin: *`, so browser
  clients on other origins can call them directly. `OPTIONS` on any route
  returns `204` with no body.
- **Authentication** — the five public routes require none. They are intended
  for this app's own clients on a trusted network. The two admin routes
  authenticate with `SHARED_ADMIN_SECRET` in the path.
- **Errors** — JSON `{"error": "<reason>"}`, where `<reason>` is one of the
  values listed per endpoint. Every route except the two admin routes uses a
  meaningful HTTP status alongside it.

## Summary

| Method | Path                                  | Auth   | Purpose                            |
| ------ | ------------------------------------- | ------ | ---------------------------------- |
| `GET`  | `/api/videos`                         | none   | Paginated video list, newest first |
| `GET`  | `/api/search`                         | none   | Search video titles                |
| `GET`  | `/api/m3u8/{id}`                      | none   | HLS master playlist for a video    |
| `GET`  | `/api/m3u8/{id}/proxy/{token}`        | token  | Serve one googlevideo resource     |
| `POST` | `/api/watch/{id}`                     | none   | Record one watch of a video        |
| `GET`  | `/api/getAvatar/{channelId}/{secret}` | secret | Resolve a channel avatar URL       |
| `GET`  | `/api/reCache/{id}/{secret}`          | secret | Rebuild the video cache            |

---

## `GET /api/videos`

Every cached video, newest first.

### Query parameters

| Name   | Type    | Required | Default | Notes                       |
| ------ | ------- | -------- | ------- | --------------------------- |
| `page` | integer | no       | `1`     | Must be a positive integer. |

### Response

`200` — a bare JSON **array** of 50 objects (fewer on the last page, empty if
the page is past the end). There is no wrapper object and no total count.

```json
[
	{
		"id": "qO7KbCY3IO4",
		"thumbnail": "https://i.ytimg.com/vi/qO7KbCY3IO4/hq720.jpg",
		"channel": "UCKB96A7eayr1L5hg60qcgLw",
		"channelAvatar": "https://yt3.googleusercontent.com/gx7-Jzy0Yj02...=s0",
		"channelName": "The Basement",
		"title": "Two Zelda PROS try the ORIGINAL"
	}
]
```

| Field           | Type   | Notes                                         |
| --------------- | ------ | --------------------------------------------- |
| `id`            | string | YouTube video ID, usable as `{id}` elsewhere. |
| `thumbnail`     | string | Thumbnail URL from the cache.                 |
| `channel`       | string | Channel ID, starts with `UC`.                 |
| `channelAvatar` | string | Avatar URL from the cache.                    |
| `channelName`   | string | Display name.                                 |
| `title`         | string | Video title, sanitized.                       |

### Errors

| Status | Body                          | Cause                                                   |
| ------ | ----------------------------- | ------------------------------------------------------- |
| `400`  | `{"error":"invalid_request"}` | `page` missing is fine, but non-integer, `< 1`, or `0`. |

---

## `GET /api/search`

Case-insensitive substring match against video titles.

### Query parameters

| Name   | Type    | Required | Default | Notes                                         |
| ------ | ------- | -------- | ------- | --------------------------------------------- |
| `q`    | string  | **yes**  | —       | Search term. Rejected if empty or whitespace. |
| `page` | integer | no       | `1`     | Must be a positive integer.                   |

### Response

`200` — a bare JSON array in exactly the same shape as `/api/videos`, ordered
by `publishedAt` descending.

```json
[
	{
		"id": "qO7KbCY3IO4",
		"thumbnail": "https://i.ytimg.com/vi/qO7KbCY3IO4/hq720.jpg",
		"channel": "UCKB96A7eayr1L5hg60qcgLw",
		"channelAvatar": "https://yt3.googleusercontent.com/gx7-Jzy0Yj02...=s0",
		"channelName": "The Basement",
		"title": "Two Zelda PROS try the ORIGINAL"
	}
]
```

### Errors

| Status | Body                          | Cause                                                     |
| ------ | ----------------------------- | --------------------------------------------------------- |
| `400`  | `{"error":"invalid_request"}` | `q` absent, empty, or only whitespace; or `page` invalid. |

---

## `GET /api/m3u8/{id}`

Builds an HLS master playlist pointing at a native HLS video track and its
audio track, so a player can stream the video directly instead of using
YouTube's own page.

This is the only endpoint that shells out to `yt-dlp`, and it is the slowest
by a wide margin — see [Performance](#performance).

### Path parameters

| Name | Type   | Notes                                                       |
| ---- | ------ | ----------------------------------------------------------- |
| `id` | string | YouTube video ID: exactly 11 characters of `[A-Za-z0-9_-]`. |

### Query parameters

| Name         | Type   | Required | Default | Notes                                                |
| ------------ | ------ | -------- | ------- | ---------------------------------------------------- |
| `resolution` | number | no       | `1080`  | Upper height cap. Must be a positive, finite number. |

`resolution` is a **ceiling, not an exact match**: the route returns the
highest available height that is `<= resolution`. Asking for `1440` or `2160`
on a 1080p video returns the 1080p variant.

### Response

`200` — the master playlist as `application/vnd.apple.mpegurl`:

```
#EXTM3U
#EXT-X-VERSION:4
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="/api/m3u8/qO7KbCY3IO4/proxy/aHR0cHM6Ly9tYW5pZmVzdC5nb29nbGV2aWRlby5jb20v..."
#EXT-X-STREAM-INF:BANDWIDTH=6296865,RESOLUTION=1920x1080,AUDIO="audio"
/api/m3u8/qO7KbCY3IO4/proxy/aHR0cHM6Ly9tYW5pZmVzdC5nb29nbGV2aWRlby5jb20v...
```

Notes on the playlist:

- **The URIs point back at this instance**, not at `googlevideo.com`, and a
  player follows them through
  [`/api/m3u8/{id}/proxy/{token}`](#get-apim3u8idproxytoken). Google's CDN only
  sends `Access-Control-Allow-Origin` for YouTube's own origins, so a browser
  cannot read its playlists or segments cross-origin. Treat any change that
  points a playlist straight at `googlevideo.com` as a regression.
- The URIs are root-relative and already include `NEXT_PUBLIC_BASEDIR`, so they
  work unchanged when the app is served under a base path.
- There is no `CODECS` attribute. `yt-dlp` reports no `acodec` for these audio
  itags, so there is no trustworthy RFC 6381 string to advertise.
- Video is picked with a preference for `avc1`, because native HLS players
  (notably Safari) cannot handle VP9 in HLS.
- Audio is the original track where possible: a non-dubbed track wins, then one
  YouTube marks as original, then an English track, then the highest itag. A
  non-English video with no English audio falls back to its original language.
  This avoids YouTube auto-dub tracks being served by mistake.

### Errors

| Status | Body                          | Cause                                                              |
| ------ | ----------------------------- | ------------------------------------------------------------------ |
| `400`  | `{"error":"invalid_request"}` | `id` malformed, or `resolution` non-numeric, `0`, or negative.     |
| `400`  | `{"error":"bad_resolution"}`  | `resolution` is below every height YouTube reports for this video. |
| `403`  | `{"error":"not_cached"}`      | The video is not in this instance's `videoCache`.                  |
| `500`  | `{"error":"error"}`           | `yt-dlp` failed or returned no usable formats.                     |

### Access control

A video is served if and only if it is a row in `videoCache` — that is, it
belongs to a channel on this instance's allow list and has not been
blacklisted. The whitelist still permits individual videos from channels that
are not fully allowed.

**This route does not record a watch.** Players call it several times per
playback (startup, bandwidth probes, retries), and counting each one inflated
the watch history. Use [`POST /api/watch/{id}`](#post-apiwatchid) for that.

### Performance

The first request for a video spawns a `yt-dlp` process and takes several
seconds. Afterwards:

- Concurrent requests for the same video share one `yt-dlp` run, so a burst
  does not fan out into many processes.
- The resulting format list is cached per video for 5 minutes, so later
  requests — including requests for other resolutions of the same video —
  return in milliseconds. The cache holds 64 videos and evicts the oldest
  first.

The 5-minute window exists because the `googlevideo` URLs are only valid for a
few hours; formats are not cached indefinitely, and no resolution data is
persisted from this path beyond the heights recorded in `videoResolutions`.

---

## `GET /api/m3u8/{id}/proxy/{token}`

Fetches one `googlevideo.com` resource on the player's behalf and hands back the
bytes. It exists to get media past the browser's CORS check: Google's CDN
answers with `Vary: Origin` and echoes `Access-Control-Allow-Origin` only for
its own origins, while every HLS client loads playlists and segments with XHR,
which is always a CORS request.

No client in this app calls this route directly. It is discovered by following
the URIs in a master playlist from [`/api/m3u8/{id}`](#get-apim3u8id).

### Path parameters

| Name    | Type   | Notes                                                                                                                |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `id`    | string | YouTube video ID: exactly 11 characters of `[A-Za-z0-9_-]`. Covered by the signature.                                |
| `token` | string | base64url of the target URL, a `.`, then an HMAC over the id and the URL. Minted by the server; never built by hand. |

Tokens are about 1.7 kB of URL, and the `id` in the path has to match the one
that was signed — a token minted for one video cannot be replayed under another.

### Response

Two shapes, picked by what Google served:

- a **playlist** (`application/vnd.apple.mpegurl`) is fetched whole and every
  URI in it is rewritten to point back here — bare segment lines and
  `URI="..."` attributes alike — so that the segments are proxied too;
- anything else is a **media segment**, and the body is streamed through
  untouched, keeping Google's `content-type`, `content-length` and caching
  headers.

Both carry `Access-Control-Allow-Origin: *`. A rewritten playlist is much
larger than the original — roughly 1.4× on a long video, since every segment
URL is longer.

### Errors

| Status | Body                          | Cause                                                                                           |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `400`  | `{"error":"invalid_request"}` | `id` malformed, or the token is not a URL this instance signed for this `id`.                   |
| `502`  | `{"error":"upstream_error"}`  | `googlevideo` was unreachable or answered non-2xx. Usually an expired URL — refetch the master. |

### Notes

- **All video bandwidth goes through this process.** There is no way around it:
  the browser always sets its own `Origin`, and Google's allowlist does not
  include this app. Fetching from the server also means the `ip` parameter baked
  into the signed URLs always matches the machine doing the fetching, so LAN
  clients work too.
- **The cache check stays on the m3u8 route.** A token can only be minted from a
  master playlist, which that route only produces for a video in `videoCache`.
  The proxy does not repeat the lookup, since that would be one query per
  segment.
- **Tokens are stateless** — signed with `SHARED_ADMIN_SECRET`, with no database
  or in-memory lookup — so they survive a restart and cost nothing to verify. A
  token is only as long-lived as the Google URL inside it, a few hours.
- **Only `*.googlevideo.com` over https is reachable.** The allowlist is narrow
  on purpose: without it this route would be an SSRF relay into whatever else
  the server can see.
- Google's playlists are `PLAYLIST-TYPE:VOD`, so a client fetches each one once
  instead of polling it.

---

## `POST /api/watch/{id}`

Appends one row to the watch history. Call it once per playback, not once per
playlist fetch.

### Path parameters

| Name | Type   | Notes                                                       |
| ---- | ------ | ----------------------------------------------------------- |
| `id` | string | YouTube video ID: exactly 11 characters of `[A-Za-z0-9_-]`. |

### Request body

None. Send no body; only the path matters.

### Response

`200`:

```json
{ "status": "recorded" }
```

### Errors

| Status | Body                          | Cause                                             |
| ------ | ----------------------------- | ------------------------------------------------- |
| `400`  | `{"error":"invalid_request"}` | `id` malformed.                                   |
| `403`  | `{"error":"not_cached"}`      | The video is not in this instance's `videoCache`. |
| `500`  | `{"error":"error"}`           | The insert failed.                                |

`GET` on this path returns `405`.

### Notes

- **This is not idempotent.** Each call inserts a row, so a retry or a
  double-tapped button counts twice. De-duplicate on the client if that
  matters.
- **There is no authentication.** Anyone who can reach the instance can
  inflate the watch history. This is a deliberate trade-off for a trusted
  internal app; put the instance behind a network boundary if that is not
  true for you.

---

## `GET /api/getAvatar/{channelId}/{secret}`

Resolves a channel's current avatar URL, fetching it with `yt-dlp` if it is not
already cached. Intended for server-side use.

### Path parameters

| Name        | Type   | Notes                                 |
| ----------- | ------ | ------------------------------------- |
| `channelId` | string | YouTube channel ID, starts with `UC`. |
| `secret`    | string | Must equal `SHARED_ADMIN_SECRET`.     |

### Response

`200` with the URL:

```json
{ "url": "https://yt3.googleusercontent.com/gx7-Jzy0Yj02...=s0" }
```

### Failures

Both of these return `200` with an error body — the route does not set error
status codes:

| Body                                | Cause                                                |
| ----------------------------------- | ---------------------------------------------------- |
| `{"error":"no perms"}`              | `secret` is wrong or `SHARED_ADMIN_SECRET` is unset. |
| `{"error":"unable to find avatar"}` | No avatar could be resolved.                         |

Check for the `error` key rather than relying on the status code.

---

## `GET /api/reCache/{id}/{secret}`

Deletes cached videos for a channel and refills them with `yt-dlp`.

### Path parameters

| Name     | Type   | Notes                                                     |
| -------- | ------ | --------------------------------------------------------- |
| `id`     | string | A channel ID, or the literal `all` to rebuild everything. |
| `secret` | string | Must equal `SHARED_ADMIN_SECRET`.                         |

### Response

`200`, immediately:

```json
{ "status": "working" }
```

The refill is **not** awaited — the response returns while `yt-dlp` still runs
in the background, which for `all` can take many minutes.

### Failures

`{"error":"no perms"}` (also `200`) when `secret` is wrong.

### Notes

- `id=all` clears the whole `videoCache` and `videoResolutions`, then refills
  every `fullyAllowed` channel, followed by a pass over the whitelist to
  restore individually allowed videos.
- `videoCache` and `videoResolutions` have **no cascade** between them, so
  resolution rows are deleted explicitly.
- `videoResolutions` is also cleaned up when a video is blacklisted or
  whitelisted, so no orphaned rows remain.

---

## Environment variables

| Variable              | Required | Purpose                                                                                             |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | yes      | PostgreSQL connection string. Startup fails without it.                                             |
| `SHARED_ADMIN_SECRET` | yes      | Authenticates the admin routes. Startup fails without it.                                           |
| `VERBOSE_LOG`         | no       | Set to exactly `1` to re-enable the m3u8 progress logs. Anything else, or unset, keeps them silent. |

`VERBOSE_LOG` exists because the m3u8 endpoints run on every playback and their
progress output is noise in production. `console.error` output is never
suppressed, so real failures are always logged.
