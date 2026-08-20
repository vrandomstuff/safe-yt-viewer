<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Quick commands

- `pnpm dev` / `pnpm build` / `pnpm start` — dev server, production build, production server
- Typecheck: `node_modules/.bin/tsc --noEmit` (not in `package.json` but works)
- `pnpm lint` — ESLint (flat config, eslint v9)
- `pnpm format` — Prettier (tabs, LF endings per `.editorconfig`)
- `npx drizzle-kit push` — push Drizzle schema to PostgreSQL (**must use `npx`**, not `pnpm dlx` or `pnpx`)

## Architecture

Next.js 16 + React 19 App Router app backed by PostgreSQL via Drizzle ORM. Uses `yt-dlp` (requires `deno` in PATH for YouTube challenge solving) to fetch YouTube channel/video metadata, caches results in the DB.

- `src/instrumentation.ts` — exports `db` (drizzle instance), validates `.env` vars on startup
- `src/lib/channel.ts` — core YouTube data fetching via yt-dlp, video cache management
- `src/lib/whitelistManager.ts` — caches whitelisted videos from non-fullyAllowed channels
- `src/db/schema.ts` — Drizzle schema: channels, tokens, avatarCache, videoCache, watchData, whitelist, blacklist
- `src/app/admin/` — admin panel (auth via `SHARED_ADMIN_SECRET`)
- `src/app/api/reCache/[id]/[secret]/` — re-cache endpoint, also uses `SHARED_ADMIN_SECRET`
- `src/app/api/getAvatar/[channelId]/[secret]/` — returns avatar URL for a channel, also uses `SHARED_ADMIN_SECRET`
- `circle.py` — standalone Python script for circular-cropping images (not part of the app)

## Environment

Requires `.env` with `DATABASE_URL` (PostgreSQL) and `SHARED_ADMIN_SECRET` (admin auth). See `INSTALL.md` for full setup. External tools needed: `node`, `deno`, `pnpm`, `python3`, `pip`, `yt-dlp`.

## Gotchas

- `drizzle-kit push` **must** be invoked with `npx` — `pnpm dlx` and `pnpx` will not work.
- yt-dlp is called with `maxBuffer: 64 * 1024 * 1024` (64MB) — large channel dumps can be big.
- Video/avatar caches expire after 30 days. Cache fill skips live streams and blacklisted videos.
- Channel ID must start with `UC` (second char `'C'`) to convert to uploads playlist (`UU` prefix).
- `allowedDevOrigins` in `next.config.ts` includes `192.168.0.188` — adjust for your LAN.
- **NEVER read JSON files that look like channel IDs** — they can be huge and cause OOM.
- Pre-commit hook (husky + lint-staged) auto-runs Prettier on all staged files.
- `CLAUDE.md` points here; keep it that way.
- `fillVideoCache` in `channel.ts` **must** pass `--extractor-args 'youtubetab:approximate_date'` to yt-dlp — without it `timestamp` is null and every video is silently skipped.
- Don't import `channel.ts` from `instrumentation.ts` — `instrumentation.ts` exports `db` which `channel.ts` imports; reversing this creates a circular dependency.
- Next 16 changed APIs: dynamic-route `params` is a `Promise` that must be `await`ed; pages/layouts are typed with global route-aware helpers (`PageProps<"/watch/[id]">`, `LayoutProps<"/">`). Read `node_modules/next/dist/docs/` before writing route code.
- Path alias `@/*` maps to `src/*`.
- `watchData` writes happen in `src/app/embed.tsx`, not in `watch/[id]/page.tsx`. The watch page is purely an access gate.
- `videoList.tsx` does not join `channels` — the `Video` component handles its own channel query per video (intentional N+1).
- The reCache `id=="all"` path only re-fetches channels where `fullyAllowed` is true; channels added via whitelistManager have `fullyAllowed: false` and are excluded from bulk reCache.
