<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

NEVER EVER READ ANY JSON FILES THAT LOOK LIKE CHANNEL IDS SO YOU DO NOT CRASH ANYTHING BECAUSE OF OOM

# safe-yt

YouTube content filter: block videos unless the uploader is allowed or the video is whitelisted. Postgres via Drizzle + Next.js 16 App Router.

## Commands
- `pnpm dev` / `pnpm build` / `pnpm start` — package manager is pnpm@11.11.0 (no npm/yarn)
- `pnpm lint` — ESLint only; no test script
- Typecheck: `node_modules/.bin/tsc` (not in `package.json`, but `tsc --noEmit` is clean)
- Quick standalone checks: `node_modules/.bin/tsx -e "..."` exercises single modules without booting Next
- Sync schema to the DB with `npx drizzle-kit push`; `generate`/`migrate` caused errors, so don't use them

## How it's wired
- `src/instrumentation.ts` — exports `db` (drizzle node-postgres from `DATABASE_URL`). Nothing runs at boot; there is no cache-fill hookup.
- `src/lib/channel.ts` — `fillVideoCache(channelId)` runs `yt-dlp --flat-playlist` against the channel's `UU<id>` playlist and inserts into `videoCache`; `getChannelAvatar(channelId)` returns the `avatar_uncropped` thumbnail URL
- `src/app/api/reCache/[id]/route.ts` — the only trigger for `fillVideoCache`. GET route: `await db.delete(videoCache)` (wipes the whole table) then calls `fillVideoCache` without `await` (fire-and-forget); `all` loops the `channels` table, otherwise fills one channel
- `get-channel-data.sh` — dumps the PortalRunner (`UCx-PpwbajI5ToAY0WwJO2Kg`) playlist to `UC<id>.json` in the repo root (gitignored, unreadable — see OOM warning)
- `src/db/schema.ts` — `channels`, `videoCache`, `whitelist`, `blacklist`
- Routes: `src/app/page.tsx` embeds one arbitrary row (`limit(1)`, no `ORDER BY`); `src/app/watch/[id]/page.tsx` checks `videoCache`/`whitelist`/`blacklist` then embeds via `src/app/embed.tsx` (youtube-nocookie iframe)

## Gotchas
- `.env` holds `DATABASE_URL` and is gitignored; never read or commit it. If the user explicitly approves database access, use `source .env; psql $DATABASE_URL` as the command base without printing the connection string or `.env` contents.
- `channel.ts` imports `db` from `../instrumentation` instead of a dedicated db module, using it only inside async function bodies. Do not import `channel.ts` back into `instrumentation.ts` or you recreate a circular import.
- `fillVideoCache` only accepts `UC...` ids (`channel_id[1]` must be `'C'`) and fetches the `UU...` uploads playlist. It skips live streams (`live_status` set) and videos with a null `timestamp`; thumbnails are synthesized from the video id (`i.ytimg.com/vi/<id>/maxresdefault.jpg`), not taken from yt-dlp.
- Always pass `--flat-playlist` to yt-dlp (both helpers do) and `--extractor-args 'youtubetab:approximate_date'` — without the extractor args `timestamp` is null and every video is skipped.
- Next 16 changed APIs: dynamic-route `params` is a `Promise` that must be `await`ed; pages/layouts are typed with global route-aware helpers (`PageProps<"/watch/[id]">`, `LayoutProps<"/">`). Read `node_modules/next/dist/docs/` before writing route code.
- `fillVideoCache` needs `yt-dlp` on PATH and a reachable Postgres; failures are caught and logged, execution continues.
