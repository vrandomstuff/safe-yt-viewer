<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## PERMISSION RULES — READ FIRST

- **NEVER EVER edit, create, overwrite, or delete any file without explicit permission from the user.** Answering a question or describing a change does NOT authorize implementing it — ask first, wait for a yes.
- This includes "harmless" operations that modify files: repo-wide formatters, code generators, git commands that touch files (`git checkout --`, `git restore`, `git stash`), etc.
- Exception: running `pnpm format` / Prettier is ALWAYS allowed, no matter what — formatting is enforced by the pre-commit hook anyway, so it can never cause damage.
- Your user is the owner of all of the files they have the final say no matter what.
- You may not ever modify this yourself.

## Quick commands

- `pnpm dev` / `pnpm build` / `pnpm start` — dev server, production build, production server
- `pnpm typecheck` — TypeScript (`tsc --noEmit`)
- `pnpm lint` — ESLint (flat config, eslint v9; bare `eslint` lints the whole repo)
- `pnpm format` — `prettier --write .` (always safe to run)
- `pnpm agentFinish` — typecheck + lint + format in one; **run after finishing every task**
- `pnpm run ci` — typecheck + lint + `prettier --check .`. **Must be `pnpm run ci`, NOT `pnpm ci`** — `pnpm ci` is pnpm's built-in clean install ("Runs clean then install with a frozen lockfile"): it deletes and reinstalls `node_modules`. There is **no CI workflow in the repo** (no `.github/`, no `.forgejo/`), so this script is the local stand-in.
- `npx drizzle-kit push` — push Drizzle schema to PostgreSQL (**must use `npx`**; `pnpx`/`pnpm dlx` do not work here, per `INSTALL.md`)
- Package manager is pinned: `pnpm@12.6.0` in `packageManager`.
- There is no test suite and no test script. Verify with `pnpm run ci`; add a focused runtime check by hitting the route on the running dev server.

**Do not run `pnpm build` while `pnpm dev` is running** — both write `.next` and the build clobbers the dev server's state. Stop the dev server first, or skip the build.

`pnpm start` serves whatever was last built, so a route file you just added answers `404` until you rebuild and restart it. Only `pnpm dev` picks up new files. Check what is actually on a port before trusting a `404` — see the dev server note below.

## Architecture

Next.js 16.3.4 + React 19 App Router, PostgreSQL via Drizzle ORM. Uses `yt-dlp` (needs `deno` in PATH for YouTube challenge solving) to fetch channel/video metadata and caches results in the DB. Single app — `pnpm-workspace.yaml` is **not** a monorepo, it only carries pnpm's `allowBuilds` list.

- `src/instrumentation.ts` — exports `db` (drizzle instance), validates `.env` on startup
- `src/lib/videoManager.ts` — the busiest file: `fetchHlsFormats` (yt-dlp format list + in-process memo), `fillVideoCache` (channel cache fill), `getM3u8Playlists` (HLS track selection), `recordWatch` (watch analytics), `getThumbnailUrl`
- `src/lib/hlsProxy.ts` — signs the googlevideo URLs the m3u8 route hands out and rewrites playlists so every URI points back at the proxy route
- `src/lib/channelManager.ts` — channel metadata + avatar fetching via yt-dlp, both 30-day cached
- `src/lib/whitelistManager.ts` — `fillVideoCacheFromWhitelist`; caches whitelisted videos from channels that are not fully allowed (inserts those channels with `fullyAllowed: false`)
- `src/lib/pinManager.ts` / `src/lib/blacklistManager.ts` — pin / blacklist CRUD
- `src/lib/sanitizeText.ts` — strips invisible and control characters from titles, because some clients are WIN1252; every `videoCache` / `watchData` title write goes through it
- `src/lib/parseCookie.ts` — `"use client"` helper the admin panel uses to read the `token` cookie
- `src/db/schema.ts` — Drizzle schema: pins, channels, tokens, avatarCache, channelMetadataCache, videoCache, **videoResolutions**, watchData, whitelist, blacklist, plus the raw-SQL `contains()` helper
- `src/app/hlsPlayer.tsx` — the player: native HLS on Safari, `hls.js` everywhere else. `embed.tsx` points it at `{BASEDIR}/api/m3u8/{id}`; `watch/{id}/page.tsx` is the access gate that renders `embed.tsx`
- `src/app/admin/` — admin panel; login stores a random session token in `tokens` plus a 24h cookie. Server pages guard with `await redirectIfNotAuthed()` (`admin/auth/actions.ts`); client pages use `useRedirectIfNotAuthed()` (`admin/auth/clientRedirectAuthed.tsx`)
- **No migration files are committed.** `drizzle.config.ts` writes to `./drizzle`, which `.gitignore`s, so schema history is not in git — `npx drizzle-kit push` is the only way changes reach the database
- `setup.js` — **unfinished stub**: it prompts for the DB URL and admin password, then exits without writing anything (`writeEnv` is empty). Configure `.env` by hand
- `get-channel-data.sh` — `#!/bin/zsh` + `jq`; dumps one channel to `UC*.json` beside itself
- `circle.py` — standalone Python script for circular-cropping images (not part of the app)
- `CLAUDE.md` contains only `@AGENTS.md` — keep it that way

### `roku-channel/` — a second project in the tree

A BrighterScript Roku client for this API, kept as a reference implementation for custom clients. It is **not** a pnpm workspace member (`pnpm-workspace.yaml` has no `packages:`, only `allowBuilds`), so it keeps its own npm deps, its own `package-lock.json` and its own `package.json`. Root `prettier`, `eslint` and `tsc` all skip it (no `.ts`/`.js` sources; `.bs`/`.xml` have no Prettier parser), so **`pnpm run ci` passing says nothing about it**.

- `npm run build` (`npx brighterscript`) — the only gate: transpiles and reports BrighterScript errors. There is no `check` script.
- `npm run deploy` (`npx brighterscript --deploy`) — same, plus zip + install to the attached device. `bsconfig.json` sets `outFile` to `out/roku_channel.zip`.
- Bump `build_version` in `roku-channel/manifest` before deploying, or the device treats the zip as the build it already has.
- Layout: `source/` is main-thread + shared code (`Main.bs` runs the message loop and creates `MainScene`; `api.bs` wraps the two calls it makes, `getVideoList`/`submitWatch`, over `roku-requests`; `config.bs` holds the one `API_BASE` const; `video.bs` builds the player node). `components/` is SceneGraph: `MainScene` → `VideoList` (MarkupGrid + pagination) → `VideoDisplay` item component, plus `VideoPlayer` and the `VideoListTask`/`SubmitWatchTask` Task nodes. `source/roku_modules/rokurequests` is vendored via ropm and is listed separately in `bsconfig.json`.
- `VideoDisplay.bs` is the canonical item-component pattern: observe `itemContent`, then read the fields off it.
- `VideoList.bs` pages by observing the grid's `itemFocused` and firing a Task per page; the grid shows 2×2 with 50 videos per page.
- Roku is debugged on-device with the **micro debugger on port 8005** — `STOP` in the source suspends the thread and the dump prints every local with its type, which is how a `content` that is `Invalid` gets pinned down.

## API

Full reference, including request/response shapes and every error code, is in **`API.md`**. Read it before changing any route.

- `GET /api/videos?page=` — 50/page, bare array, newest first
- `GET /api/search?q=&page=` — case-insensitive title substring, same array shape
- `GET /api/channel?channel=&page=` — same array shape, one channel; `channel` is required and must be `UC` + 22 chars
- `GET /api/pins?page=` — same array shape, pinned videos, read through `videoCache`
- `GET /api/m3u8/{id}?resolution=` — HLS master playlist; `resolution` is a **ceiling**, returns the highest height `<= resolution`. Only route that spawns yt-dlp
- `GET /api/m3u8/{id}/proxy/{token}` — serves one googlevideo playlist or segment; `token` carries the target URL, HMAC-signed with `SHARED_ADMIN_SECRET`
- `POST /api/watch/{id}` — appends one watchData row; **not idempotent**
- `GET /api/getAvatar/{channelId}/{secret}` and `GET /api/reCache/{id}/{secret}` — admin routes, authenticate via `SHARED_ADMIN_SECRET` in the URL path

The seven public routes are deliberately unauthenticated (trusted internal app); each sets `Access-Control-Allow-Origin: *` and exports `OPTIONS` → `204`. The two admin routes do **neither** (API.md's intro claims every route does) and return their error bodies with **HTTP 200** (`{"error":"no perms"}`), so check the `error` key, not the status.

The four list routes all return the same array shape; the type lives in `src/lib/videoListEntry.ts` and is imported by each route, so add fields there rather than in a route.

## Environment

`.env` needs `DATABASE_URL` (PostgreSQL) and `SHARED_ADMIN_SECRET`; startup throws if either is missing. Set `NEXT_PUBLIC_BASEDIR` to an **empty value — do not leave the line out**: `next.config.ts` uses `?? ""` for `basePath`, but `home.tsx`, `searchBar.tsx`, `page.tsx` and `embed.tsx` concatenate the raw variable straight into asset and m3u8 URLs, so a missing value yields `undefined/home_icon.png` and a dead player. When it has a value, every path above is served under `/{basePath}/`, and client components inline `NEXT_PUBLIC_*` at build time, so changing it needs a rebuild.

`VERBOSE_LOG=1` re-enables the m3u8 progress logs, which are silent otherwise (only the exact value `1` enables them; `true`/`yes` do not). Errors always log. See `INSTALL.md` for full setup — `README.md` is untouched create-next-app boilerplate and documents none of this. External tools: `node`, `deno`, `pnpm`, `python3`/`python`, `pip`, `yt-dlp`.

## Gotchas

### Data & correctness

- **Segments are proxied for two independent reasons; keep both in mind before "simplifying" the route.** (1) Google's CDN answers with `Vary: Origin` and only echoes `Access-Control-Allow-Origin` for YouTube's own origins, and every HLS client loads playlists and segments with XHR — no player-side setting changes that, since a browser always sets its own `Origin`. (2) The `ip` baked into a signed googlevideo URL must match the machine fetching it, so serving from Node is what makes LAN clients work at all. `buildMasterPlaylist` therefore emits `/api/m3u8/{id}/proxy/{token}` URLs, and the proxy route rewrites nested playlists as it streams them. The cost is that all video bandwidth flows through Node.
- **The proxy token is signed, and only `*.googlevideo.com` over https is allowed.** The signature (`hlsProxy.ts`: base64url target, then HMAC-SHA256 over `signatureDomain\nvideoId\nurl`, keyed with `SHARED_ADMIN_SECRET` and domain-separated from its other uses) is what lets the route serve a segment without a DB round trip and means a token can only exist if the m3u8 route minted one, which is where the `videoCache` check lives. Verification is `timingSafeEqual`. The host allowlist (https, empty port, `googlevideo.com` or a subdomain) is the only thing standing between this route and being an SSRF relay — keep it narrow. Tokens are stateless, so they survive restarts and are ~1.7 kB of URL; a media playlist comes back at roughly 1.4× its original size.
- **The proxy route asks for `Accept-Encoding: identity`** so a streamed body cannot disagree with a `content-length`/`content-encoding` that `fetch` transparently inflated. It also passes through `content-length`, `content-type`, `cache-control`, `etag`, `last-modified` only. googlevideo ignores `Range` on HLS chunks and answers 200 with the whole segment, so there is no range support to add.
- **Pagination needs a unique tiebreaker.** `publishedAt` is a date with very few distinct values — the whole table has 48, and up to 449 videos share one. Always `orderBy(desc(videoCache.publishedAt), desc(videoCache.videoId))`. Without the second key, row order inside a tie is arbitrary and `OFFSET` paging silently returns duplicates and skips rows. This was a real bug in `videoList.tsx`, `search/[queryUri]/page.tsx`, and `channel/[id]/page.tsx`; the four API routes and all four pages are now in sync, so keep it that way.
- **A proxy `403` is a normal, recoverable event.** It means the googlevideo URL inside the signed token is stale (or geo-blocked / PO-token-gated), and `hls.js` never retries a 4xx, so `hlsPlayer.tsx` intercepts it, reloads the master playlist (the only thing that mints fresh tokens) and caps that at two attempts per playback, rebuilding the instance because a fatal error state does not clear otherwise. The native-HLS branch does the same on `video.error.code === 2`, which is the only network-error code the element reports. The route logs the first 403 per video and stays quiet after that — expiry is routine, but silence would also hide a persistent geo-block.
- **`videoManager` memoizes the yt-dlp format list in process**: `formatCache` (5 min TTL, 64 entries, insertion-order eviction) plus `inFlightFormats` so concurrent requests for one video share a single yt-dlp run. Both are module-level, so they are per-process and vanish on restart. Don't add a route-level cache on top, and don't assume a second instance shares them.
- **`videoResolutions` is a pre-flight check, not just a record.** If rows exist for a video and the requested `resolution` is below the lowest known height, the route answers `bad_resolution` without spawning yt-dlp at all. Heights are rewritten on every successful lookup, so a video whose formats changed can briefly reject a resolution that is now available — bump it by re-requesting a higher ceiling.
- **The Roku client is plain HTTP on the LAN, and that is deliberate.** `roku-channel/source/config.bs` pins `API_BASE = "http://192.168.0.188:3000/api"` — the same LAN address as `allowedDevOrigins`. The Roku loads thumbnails and avatars itself, straight from the `i.ytimg.com` / `yt3.googleusercontent.com` URLs the list routes return, so only the media path depends on this server. The Roku only ever fetches the master playlist from `API_BASE + /m3u8/{id}` (`streamformat = "hls"`) and follows the proxy URIs in it, so all of its video bandwidth is the loopback-ish LAN hop to this server.
- **`pins` rows can outlive their `videoCache` row.** `/api/pins` and `pins/page.tsx` both join `videoCache` — for the title, thumbnail and channel in the route, and so that the page skips pins whose video is gone, since `Video.tsx` renders a bare id for an uncached video. A pin without a cache row therefore vanishes from both lists and comes back if the video is ever cached again. `addToBlacklist` deliberately leaves the `pins` row alone (it drops the cache and resolution rows only), so blacklisting a pinned video hides its pin rather than unpinning it — `removeFromPins` in the admin panel is the only thing that deletes one. A `reCache` drops every cache row, so it hides every pin on that channel until the refill restores the videos.
- **Removing a channel does not revoke its videos.** `removeChannel` (`channelManager.ts`) deletes only the `channels` row, and that channel's `videoCache` rows survive. Every list route and list view inner-joins `channels`, so those videos silently vanish from `/`, the search, pins and `/channel/{id}` (which throws `Unable to find channel`), and `Video.tsx` would render a bare id for them — but `/api/m3u8/{id}` and `embed.tsx` gate on `videoCache` alone and never consult `channels`, so they stay watchable by direct link. Revoking means clearing the cache (`/api/reCache/{channelId}/{secret}`) or blacklisting each video.
- **`videoResolutions` has no cascade from `videoCache`.** Read the ids _before_ deleting, then delete resolution rows explicitly. Every cleanup already does this: the reCache route (both branches), `blacklistManager.ts`, and both `whitelistManager.ts` functions. `fillVideoCache` has only two callers, both inside the reCache route, so those cleanups cover every path.
- **`watchData`'s primary key is `eventDate` (`defaultNow()`) and is never supplied**, so every insert is a new row and `onConflictDoNothing()` is a no-op. Don't assume inserts are de-duplicated. Two writers: `src/app/embed.tsx` (the watch page's player, rendered by `watch/{id}/page.tsx`) and `recordWatch` in `videoManager.ts` via `/api/watch`.
- **The m3u8 route deliberately does not record watches.** A player requests the playlist several times per playback, so counting each request inflated the watch history. Watch logging is `POST /api/watch/{id}`.
- `fillVideoCache` in `videoManager.ts` **must** pass `--extractor-args 'youtubetab:approximate_date'` to yt-dlp — without it `timestamp` is null and every video is silently skipped.
- Channel ID must start with `UC` (second char `'C'`) to convert to an uploads playlist (`UU` prefix). `addChannel` takes a `@handle`, not an id, and resolves it through the 30-day `channelMetadataCache`.
- The reCache `id=="all"` path deletes the whole videoCache and refills in two passes: `fillVideoCache` per channel where `fullyAllowed` is true, then `fillVideoCacheFromWhitelist()`, which iterates the whitelist (skipping blacklisted videos). Whitelisted videos from non-fullyAllowed channels are **not** excluded from bulk reCache — the whitelist pass covers them.
- The reCache endpoint returns `"working"` immediately; `reCache()` is deliberately not awaited and continues in the background.
- **reCache authenticates two different ways.** The route checks the URL `secret` (or a token row), but `fillVideoCacheFromWhitelist` opens with `redirectIfNotAuthed()`, which checks the `token` **cookie**. A `curl` of the endpoint with no admin session therefore makes that background pass throw `NEXT_REDIRECT`; the per-channel `fillVideoCache` half has no auth check at all. The admin panel works because `admin/page.tsx` imports `reCache` from the route file and calls it as a server action with the cookie token as the "secret".
- **The admin login only hashes the password in a secure context.** `admin/auth/page.tsx` branches on `window.isSecureContext`: over https it does the salted two-step, but served over plain http on the LAN it sends `SHARED_ADMIN_SECRET` in the clear.
- **The admin login challenge salt is in memory** (`secureAuthStore` in `admin/auth/actions.ts`), so the two-step login does not survive a restart or span processes — a first failure after a restart is expected, not a bug.
- `register()` in `instrumentation.ts` wipes the `tokens` table on every server start and again every 24h via `setInterval`, so admin sessions survive neither event — intentional, don't "fix" it.
- Don't import `channelManager.ts` from `instrumentation.ts` — `instrumentation.ts` exports `db`, which `channelManager.ts` imports. Reversing it creates a circular dependency.

### Roku (BrighterScript)

- **A grid's root `ContentNode` is not reachable the way you would expect.** `m.top.findNode("VideoContentNode")` returns `invalid` even though the node exists and is parented to the grid — `findNode` walks the declaratively declared child tree, and a ContentNode built in script and assigned to `grid.content` is not in it. `m.grid.getChild(0)` also came back `invalid` on device. Use the `content` field (`m.grid.content`, the form the Roku docs use) or, better, keep the node in a field on the component (`m.content = content` in the loader) so no lookup is needed. Whatever you pick, guard for `invalid` — `content` is invalid until the first page loads.
- **Append to the existing ContentNode; do not rebuild it.** Re-assigning `grid.content = content` resets the grid's scroll offset and focus. Also iterate only the _new_ page when appending — a loop over the accumulated `m.top.videos` re-adds every earlier video on every page (the debugger showed `videos count:100` at 50 per page), so the grid grows quadratically.
- Interface fields declared in a component's `<interface>` block are read/write/observable, so `m.top.grid = m.top.findNode("grid")` is legal — that indirection is what lets `VideoPlayer.bs` reach the list through `m.top.getParent().grid`.
- `VideoPlayer` is appended to the list group rather than shown as a screen, and `back` destroys it and returns focus to the grid; any new full-screen component should follow that shape.

### Code style & framework

- **Never put `"use server"` in `videoManager.ts`, `hlsProxy.ts` or `sanitizeText.ts`.** It is a whole-module directive: it turns _every_ export into an async server action that must take serializable args, which those files can't satisfy (yt-dlp, `node:crypto`). It is used deliberately in `channelManager`/`pinManager`/`blacklistManager`/`whitelistManager` and `admin/auth/actions.ts` so client components can call them directly — keep that split. `reCache` is exported from a route file that is `"use server"`, which is how the admin panel calls it from the client.
- Path alias `@/*` maps to `src/*`; ESLint errors on relative parent imports (`../*`) — always use the alias. `@next/next/no-img-element` is off, so plain `<img>` is intentional; don't convert to `next/image`.
- Next 16: dynamic-route `params`/`searchParams` are `Promise`s that must be `await`ed. For new route files prefer inline Promise types (`{ params }: { params: Promise<{ id: string }> }`) over the global `LayoutProps<"/">` helpers — that is the convention in every page and route handler here (`layout.tsx` is the one place that uses the global helper, so leave it alone).
- `src/app/api/m3u8/[id]/route.ts` types its error map as `Record<string, number>`, so a new failure reason silently returns 500. The newer `/api/watch` and m3u8 proxy routes do this properly with a named reason union — prefer that pattern.
- `videoList.tsx` does not join `channels`; the `Video` component runs its own videoCache + channels queries per video (intentional N+1). Because of that, a cached video whose `channels` row is gone renders as a bare id in the list views.
- Search is a raw `strpos(lower(col), lower(value)) > 0` fragment (`contains()` in `db/schema.ts`), not an index and not a Drizzle operator — it is fine at this scale, but it is a full scan.
- Formatting is tabs (4-wide) + LF via `.editorconfig`, `trailingComma: "none"` via `.prettierrc`. BrighterScript under `roku-channel/` is 4-space indented and is not Prettier's business.

### Tooling & environment

- yt-dlp is called with `maxBuffer: 64 * 1024 * 1024` (64MB) — large channel dumps can be big.
- `pnpm build` wants network: `layout.tsx` uses `next/font/google`, which fetches the font files at build time.
- Video/avatar/channel-metadata caches expire after 30 days. Cache fill skips live streams and blacklisted videos.
- `allowedDevOrigins` in `next.config.ts` includes `192.168.0.188` — adjust for your LAN.
- **Never read a root JSON file whose name looks like a channel/video id.** `.gitignore` has `UC*.json` and `UU*.json` (plus `.*.json`) precisely for the dumps `get-channel-data.sh` writes next to the script, so they are invisible to `git status` and to normal listings — but a full channel dump is hundreds of MB and will OOM your context. Check sizes (`Get-Item . Length`) instead of reading them.
- **Pre-commit hook** (`.husky/pre-commit`) runs `lint-staged` (Prettier only, `**/*`), then `generate_licenses.py`, then `git add public/licenses.html public/licenses`. It needs `python` or `python3` **and** `pnpm` on PATH, or the commit fails; the script runs `pnpm licenses ls --json` and downloads some license texts, so it wants network. It rewrites the whole `public/licenses/` dir every run and skips the write when nothing changed. `.prettierignore` covers `public/licenses*` and `.gitattributes` marks both paths `linguist-generated`.
- `generate_licenses.py` deliberately runs `pnpm licenses ls --json` **without** `-P`: pnpm 12's production filter drops so many entries that the page would under-report what actually ships. If you add a dependency whose license text is not in the package, add it to `LICENSE_URL_OVERRIDES` rather than editing the output.
- `git add -A` sweeps in the generated `public/licenses/LICENSE.*.txt` files, which the pre-commit hook stages anyway, plus whatever else is untracked. Stage deliberately when you want a scoped commit.
- A `[Gzip]` / `MaxListenersExceededWarning` on stderr is a known Next 16.3.x internal warning, not an app memory leak. Don't suppress it with `setMaxListeners`.
- Dev servers: this app normally uses port 3000; port 3001 may belong to another project — check before assuming a port is free.
