<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

NEVER EVER READ ANY JSON FILES THAT LOOK LIKE CHANNEL IDS SO YOU DO NOT CRASH ANYTHING BECAUSE OF OOM

# safe-yt

YouTube content filter: block videos unless the uploader is allowed or the video is whitelisted. Postgres via Drizzle + Next.js 16 App Router.

## Prerequisites

- `yt-dlp`, `deno` (yt-dlp uses deno to solve YouTube challenges; without it youtube may throw 401 errors), `python3`/`pip`, `nodejs`, and `pnpm@11.11.0` all on PATH

## Commands

- `pnpm dev` / `pnpm build` / `pnpm start` — package manager is pnpm@11.11.0 (no npm/yarn)
- `pnpm lint` — ESLint only; no test script
- Typecheck: `node_modules/.bin/tsc --noEmit` (not in `package.json` but works)
- Quick standalone checks: `node_modules/.bin/tsx -e "..."` exercises single modules without booting Next
- Sync schema to the DB with `npx drizzle-kit push`; `generate`/`migrate` caused errors, don't use them

## How it's wired

- `src/instrumentation.ts` — exports `db` (drizzle node-postgres from `DATABASE_URL`). Also validates `SHARED_ADMIN_SECRET` and `DATABASE_URL` at boot via `register()`.
- `src/lib/channel.ts` — `fillVideoCache(channelId)` runs `yt-dlp --flat-playlist` against the channel's `UU<id>` playlist and inserts into `videoCache`; `getChannelAvatar(channelId)` returns the `avatar_uncropped` thumbnail URL (caches in `avatarCache` table); `getChannelMetadata(handle)` fetches channel info by handle. Has a 30-day cache: if a channel's newest cached row is < 30 days old, existing rows are kept. Also skips blacklisted videos during fill.
- `src/lib/whitelistManager.ts` — `fillVideoCacheFromWhitelist()` iterates the `whitelist` table, fetches metadata for each video via yt-dlp, ensures the channel exists in `channels`, and inserts into `videoCache`. Skips blacklisted videos.
- `src/app/api/reCache/[id]/[secret]/route.ts` — GET route; requires `SHARED_ADMIN_SECRET`. When `id == "all"`: wipes entire `videoCache` table, then loops `channels` where `fullyAllowed` is true and fire-and-forget calls `fillVideoCache` for each, plus calls `fillVideoCacheFromWhitelist()`. Otherwise: deletes only that channel's rows, then fire-and-forget fills.
- `src/app/api/getAvatar/[channelId]/[secret]/route.ts` — GET route; requires `SHARED_ADMIN_SECRET`. Returns the avatar URL for a channel.
- `src/db/schema.ts` — tables: `channels`, `tokens`, `avatarCache`, `videoCache`, `watchData`, `whitelist`, `blacklist`. Also exports a `contains(col, value)` SQL helper for case-insensitive substring search.
- `src/app/page.tsx` — renders `SearchBar` and `VideoList`; reads `?page=N` search param for pagination
- `src/app/videoList.tsx` — server component; queries `videoCache` with limit/offset ordered by `publishedAt` desc; delegates per-video rendering to `Video` component
- `src/app/Video.tsx` — server component; given a `videoId`, fetches the video row and its channel row, renders thumbnail + title + channel avatar link
- `src/app/embed.tsx` — server component; checks `videoCache`/`whitelist`/`blacklist`, writes to `watchData` on view, renders youtube-nocookie iframe with autoplay
- `src/app/watch/[id]/page.tsx` — access gate: checks `videoCache`/`whitelist`/`blacklist`; renders `YTEmbed` if allowed, "not allowed" otherwise
- `src/app/searchBar.tsx` — client component; input that navigates to `/search/<query>` on Enter or button click
- `src/app/search/[queryUri]/` — paginated search using `contains()` helper on `videoCache.title`; reuses `Video` and `SearchBar`
- `src/app/admin/` — admin panel with auth gate (`redirectIfNotAuthed`); routes for managing whitelist, blacklist, channels, and viewing watch data
- `get-channel-data.sh` — zsh script; dumps the PortalRunner (`UCx-PpwbajI5ToAY0WwJO2Kg`) playlist to `UC<id>.json` in the repo root (gitignored, unreadable — see OOM warning)

## Style

- Tabs for indentation, LF line endings (`.editorconfig`). Prettier is configured with defaults (`.prettierrc` is empty `{}`).
- Pre-commit hook runs `lint-staged` which auto-formats with Prettier. Commits must pass this.

## Gotchas

- `.env` holds `DATABASE_URL` and `SHARED_ADMIN_SECRET`; gitignored. Never read or commit it. See `INSTALL.md` for `.env` setup. If the user explicitly approves database access, use `source .env; psql $DATABASE_URL` as the command base without printing the connection string or `.env` contents.
- `channel.ts` imports `db` from `../instrumentation` instead of a dedicated db module, using it only inside async function bodies. Do not import `channel.ts` back into `instrumentation.ts` or you recreate a circular import.
- `fillVideoCache` only accepts `UC...` ids (`channel_id[1]` must be `'C'`) and fetches the `UU...` uploads playlist. It skips live streams (`live_status` set), videos with a null `timestamp`, and blacklisted videos; thumbnails are synthesized from the video id (`i.ytimg.com/vi/<id>/maxresdefault.jpg`), not taken from yt-dlp.
- Always pass `--flat-playlist` to yt-dlp (both helpers do) and `--extractor-args 'youtubetab:approximate_date'` — without the extractor args `timestamp` is null and every video is skipped.
- Next 16 changed APIs: dynamic-route `params` is a `Promise` that must be `await`ed; pages/layouts are typed with global route-aware helpers (`PageProps<"/watch/[id]">`, `LayoutProps<"/">`). Read `node_modules/next/dist/docs/` before writing route code.
- `fillVideoCache` needs `yt-dlp` on PATH and a reachable Postgres; failures are caught and logged, execution continues.
- Path alias `@/*` maps to `src/*`.
- `watchData` writes happen in `embed.tsx`, not in `watch/[id]/page.tsx`. The watch page is purely an access gate.
- `videoList.tsx` does not join `channels` — the `Video` component handles its own channel query per video.
- The reCache `id=="all"` path only re-fetches channels where `fullyAllowed` is true; channels added via whitelistManager have `fullyAllowed: false` and are excluded from bulk reCache.
