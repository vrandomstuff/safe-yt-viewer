<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/server/lib/generate-agent-files.js` (path may shift between versions). Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## PERMISSION RULES — READ FIRST

- **NEVER EVER edit, create, overwrite, or delete any file without explicit permission from the user.** Answering a question or describing a change does NOT authorize implementing it — ask first, wait for a yes.
- This includes "harmless" operations that modify files: repo-wide formatters, code generators, git commands that touch files (`git checkout --`, `git restore`, `git stash`), etc.
- Exception: running `pnpm format` / Prettier is ALWAYS allowed, no matter what — formatting is enforced by the pre-commit hook anyway, so it can never cause damage.
- Your user is the owner of all of the files they have the final say no matter what.

## Quick commands

- `pnpm dev` / `pnpm build` / `pnpm start` — dev server, production build, production server
- `pnpm typecheck` — TypeScript (`tsc --noEmit`)
- `pnpm lint` — ESLint (flat config, eslint v9)
- `pnpm format` — `prettier --write .` (always safe to run)
- `pnpm agentFinish` — typecheck + lint + format in one; **run after finishing every task**
- `pnpm run ci` — typecheck + lint + `prettier --check .`. **Must be `pnpm run ci`, NOT `pnpm ci`** — bare `pnpm ci` is pnpm's built-in clean-install: it deletes node_modules and reinstalls instead of running the script. Note there is currently **no CI workflow in the repo** (no `.github/`, no `.forgejo/`), so this script is the local stand-in.
- `npx drizzle-kit push` — push Drizzle schema to PostgreSQL (**must use `npx`**, not `pnpm dlx` or `pnpx`)
- There is no test suite. Verify with `pnpm run ci`; add a focused runtime check by hitting the route on the running dev server.

**Do not run `pnpm build` while `pnpm dev` is running** — both write `.next` and the build clobbers the dev server's state. Stop the dev server first, or skip the build.

## Architecture

Next.js 16 + React 19 App Router, PostgreSQL via Drizzle ORM. Uses `yt-dlp` (needs `deno` in PATH for YouTube challenge solving) to fetch channel/video metadata and caches results in the DB. Single app — `pnpm-workspace.yaml` is **not** a monorepo, it only carries pnpm's `allowBuilds` list.

- `src/instrumentation.ts` — exports `db` (drizzle instance), validates `.env` on startup
- `src/lib/videoManager.ts` — the busiest file: `fillVideoCache` (channel cache fill), `getM3u8Playlists` (HLS master playlist), `recordWatch` (watch analytics), thumbnail URLs
- `src/lib/channelManager.ts` — channel metadata + avatar fetching via yt-dlp
- `src/lib/whitelistManager.ts` — `fillVideoCacheFromWhitelist`; caches whitelisted videos from channels that are not fully allowed (inserts those channels with `fullyAllowed: false`)
- `src/lib/pinManager.ts` / `src/lib/blacklistManager.ts` — pin / blacklist CRUD
- `src/db/schema.ts` — Drizzle schema: pins, channels, tokens, avatarCache, channelMetadataCache, videoCache, **videoResolutions**, watchData, whitelist, blacklist
- `src/app/admin/` — admin panel; login stores a random session token in `tokens` plus a 24h cookie. Guard pages with `redirectIfNotAuthed()` (`admin/auth/actions.ts`)
- `circle.py` — standalone Python script for circular-cropping images (not part of the app)
- `CLAUDE.md` contains only `@AGENTS.md` — keep it that way

## API

Full reference, including request/response shapes and every error code, is in **`API.md`**. Read it before changing any route.

- `GET /api/videos?page=` — 50/page, bare array, newest first
- `GET /api/search?q=&page=` — case-insensitive title substring, same array shape
- `GET /api/m3u8/{id}?resolution=` — HLS master playlist; `resolution` is a **ceiling**, returns the highest height `<= resolution`. Only route that spawns yt-dlp
- `POST /api/watch/{id}` — appends one watchData row; **not idempotent**
- `GET /api/getAvatar/{channelId}/{secret}` and `GET /api/reCache/{id}/{secret}` — admin routes, authenticate via `SHARED_ADMIN_SECRET` in the URL path

All six return `Access-Control-Allow-Origin: *`; `OPTIONS` → `204`. The four public routes are deliberately unauthenticated (trusted internal app). The two admin routes return their error bodies with **HTTP 200** (`{"error":"no perms"}`), so check the `error` key, not the status.

`next.config.ts` sets `basePath: process.env.NEXT_PUBLIC_BASEDIR ?? ""`, so when that variable is set every path above is served under `/{basePath}/`. Test against a running dev server with the variable unset unless you specifically need to exercise it.

## Environment

Requires `.env` with `DATABASE_URL` (PostgreSQL) and `SHARED_ADMIN_SECRET` (admin auth); startup throws if either is missing. `VERBOSE_LOG=1` re-enables the m3u8 progress logs, which are silent otherwise (only the exact value `1` enables them; `true`/`yes` do not). See `INSTALL.md` for full setup. External tools: `node`, `deno`, `pnpm`, `python3`/`python`, `pip`, `yt-dlp`.

## Gotchas

### Data & correctness

- **Pagination needs a unique tiebreaker.** `publishedAt` is a date with very few distinct values — hundreds of videos can share one. Always `orderBy(desc(videoCache.publishedAt), desc(videoCache.videoId))`. Without the second key, row order inside a tie is arbitrary and `OFFSET` paging silently returns duplicates and skips rows. This was a real bug in `videoList.tsx`, `search/[queryUri]/page.tsx`, and `channel/[id]/page.tsx`; keep all three in sync when changing ordering.
- **`videoResolutions` has no cascade from `videoCache`.** Read the ids _before_ deleting, then delete resolution rows explicitly. Three call sites already do this: the reCache route, `blacklistManager.ts`, and `whitelistManager.ts`. `fillVideoCache` has only two callers, both inside the reCache route, so those cleanups cover every path.
- **`watchData`'s primary key is `eventDate` (`defaultNow()`) and is never supplied**, so every insert is a new row and `onConflictDoNothing()` is a no-op. Don't assume inserts are de-duplicated. Two writers exist: `src/app/embed.tsx` (legacy embed page) and `recordWatch` in `videoManager.ts` via `/api/watch`.
- **The m3u8 route deliberately does not record watches.** A player requests the playlist several times per playback, so counting each request inflated the watch history. Watch logging is `POST /api/watch/{id}`.
- `fillVideoCache` in `videoManager.ts` **must** pass `--extractor-args 'youtubetab:approximate_date'` to yt-dlp — without it `timestamp` is null and every video is silently skipped.
- Channel ID must start with `UC` (second char `'C'`) to convert to an uploads playlist (`UU` prefix).
- The reCache `id=="all"` path deletes the whole videoCache and refills in two passes: `fillVideoCache` per channel where `fullyAllowed` is true, then `fillVideoCacheFromWhitelist()`, which iterates the whitelist (skipping blacklisted videos). Whitelisted videos from non-fullyAllowed channels are **not** excluded from bulk reCache — the whitelist pass covers them.
- The reCache endpoint returns `"working"` immediately; `reCache()` is deliberately not awaited and continues in the background.
- `register()` in `instrumentation.ts` wipes the `tokens` table on every server start and again every 24h via `setInterval`, so admin sessions survive neither event — intentional, don't "fix" it.
- Don't import `channelManager.ts` from `instrumentation.ts` — `instrumentation.ts` exports `db`, which `channelManager.ts` imports. Reversing it creates a circular dependency.

### Code style & framework

- Path alias `@/*` maps to `src/*`; ESLint errors on relative parent imports (`../*`) — always use the alias. `@next/next/no-img-element` is off, so plain `<img>` is intentional; don't convert to `next/image`.
- Next 16: dynamic-route `params`/`searchParams` are `Promise`s that must be `await`ed. For new route files prefer inline Promise types (`{ params }: { params: Promise<{ id: string }> }`) over the global `LayoutProps<"/">` helpers — that's the repo convention.
- `src/app/api/m3u8/[id]/route.ts` types its error map as `Record<string, number>`, so a new failure reason silently returns 500. The newer `/api/watch` route does this properly with a named reason union — prefer that pattern.
- `videoList.tsx` does not join `channels`; the `Video` component runs its own videoCache + channels queries per video (intentional N+1).
- Formatting is tabs (4-wide) + LF via `.editorconfig`, `trailingComma: "none"` via `.prettierrc`.

### Tooling & environment

- yt-dlp is called with `maxBuffer: 64 * 1024 * 1024` (64MB) — large channel dumps can be big.
- Video/avatar/channel-metadata caches expire after 30 days. Cache fill skips live streams and blacklisted videos.
- `allowedDevOrigins` in `next.config.ts` includes `192.168.0.188` — adjust for your LAN.
- **NEVER read a root JSON file whose name looks like a channel/video ID.** `.gitignore` has a `.*.json` rule, so dot-prefixed `yt-dlp --dump-single-json` output is invisible to `git status` and to normal listings — but a full channel dump can be hundreds of MB and will OOM your context. Check sizes (`Get-Item . Length`) instead of reading them.
- Pre-commit hook (`.husky/pre-commit`) runs `lint-staged` (Prettier only), then `generate_licenses.py`, then stages `public/licenses.html` + `public/licenses`. It needs `python` or `python3` on PATH or the commit fails.
- A `[Gzip]` / `MaxListenersExceededWarning` on stderr is a known Next 16.3.x internal warning, not an app memory leak. Don't suppress it with `setMaxListeners`.
- Dev servers: this app normally uses port 3000; port 3001 may belong to another project — check before assuming a port is free.
