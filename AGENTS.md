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

## Quick commands

- `pnpm dev` / `pnpm build` / `pnpm start` — dev server, production build, production server
- `pnpm typecheck` — TypeScript (`tsc --noEmit`)
- `pnpm lint` — ESLint (flat config, eslint v9)
- `pnpm agentFinish` — typecheck + lint + format in one; **run after finishing every task**
- `pnpm run ci` — typecheck + lint + `prettier --check .`; exactly what PR CI runs (`ci.yml` exists twice: GitHub Actions and Forgejo, both Node 22 + pnpm). **Must be `pnpm run ci`, NOT `pnpm ci`** — bare `pnpm ci` is pnpm's built-in clean-install: it deletes node_modules and reinstalls instead of running the script.
- `npx drizzle-kit push` — push Drizzle schema to PostgreSQL (**must use `npx`**, not `pnpm dlx` or `pnpx`)
- There is no test suite — verify changes with typecheck, lint, and `pnpm build`.

## Architecture

Next.js 16 + React 19 App Router app backed by PostgreSQL via Drizzle ORM. Uses `yt-dlp` (requires `deno` in PATH for YouTube challenge solving) to fetch YouTube channel/video metadata, caches results in the DB.

- `src/instrumentation.ts` — exports `db` (drizzle instance), validates `.env` vars on startup
- `src/lib/channel.ts` — core YouTube data fetching via yt-dlp (channel metadata, avatar, video cache fill)
- `src/lib/whitelistManager.ts` — caches whitelisted videos from channels not fully allowed; inserts those channels with `fullyAllowed: false`
- `src/db/schema.ts` — Drizzle schema: channels, tokens, avatarCache, channelMetadataCache, videoCache, watchData, whitelist, blacklist
- `src/app/admin/` — admin panel; logging in stores a random session token in the `tokens` table plus a 24h cookie. Guard pages with `redirectIfNotAuthed()` (`admin/auth/actions.ts`)
- `src/app/api/reCache/[id]/[secret]/` — re-cache endpoint; `src/app/api/getAvatar/[channelId]/[secret]/` — avatar URL endpoint. Both authenticate via `SHARED_ADMIN_SECRET` in the URL path
- `circle.py` — standalone Python script for circular-cropping images (not part of the app)

## Environment

Requires `.env` with `DATABASE_URL` (PostgreSQL) and `SHARED_ADMIN_SECRET` (admin auth). See `INSTALL.md` for full setup. External tools needed: `node`, `deno`, `pnpm`, `python3`, `pip`, `yt-dlp`.

## Gotchas

- `drizzle-kit push` **must** be invoked with `npx` — `pnpm dlx` and `pnpx` will not work.
- yt-dlp is called with `maxBuffer: 64 * 1024 * 1024` (64MB) — large channel dumps can be big.
- Video/avatar/channel-metadata caches expire after 30 days. Cache fill skips live streams and blacklisted videos.
- Channel ID must start with `UC` (second char `'C'`) to convert to uploads playlist (`UU` prefix).
- `allowedDevOrigins` in `next.config.ts` includes `192.168.0.188` — adjust for your LAN.
- **NEVER read JSON files that look like channel IDs** — they can be huge and cause OOM.
- Pre-commit hook (husky + lint-staged) auto-runs Prettier on staged files. Formatting is tabs (4-wide) + LF via `.editorconfig`, `trailingComma: none` via `.prettierrc`.
- `CLAUDE.md` points here; keep it that way.
- `fillVideoCache` in `channel.ts` **must** pass `--extractor-args 'youtubetab:approximate_date'` to yt-dlp — without it `timestamp` is null and every video is silently skipped.
- Don't import `channel.ts` from `instrumentation.ts` — `instrumentation.ts` exports `db` which `channel.ts` imports; reversing this creates a circular dependency.
- `register()` in `instrumentation.ts` wipes the `tokens` table on every server start and again every 24h via `setInterval`, so admin sessions don't survive either event — intentional, don't "fix" it.
- Next 16 changed APIs: dynamic-route `params`/`searchParams` are `Promise`s that must be `await`ed; layouts use global route-aware helper types (`LayoutProps<"/">`). Read `node_modules/next/dist/docs/` before writing route code.
- For new route files, prefer inline Promise types (`{ params }: { params: Promise<{ id: string }> }`) over the global helper types — that's the repo convention.
- Path alias `@/*` maps to `src/*`; ESLint errors on relative parent imports (`../*`) — always use the alias. `@next/next/no-img-element` is off — plain `<img>` is intentional, don't convert to `next/image`.
- The reCache endpoint responds `"working"` immediately — `reCache()` is deliberately not awaited; cache fill continues in the background.
- `watchData` writes happen in `src/app/embed.tsx`, not in `watch/[id]/page.tsx`. The watch page is purely an access gate (cache/whitelist/blacklist check).
- `videoList.tsx` does not join `channels` — the `Video` component handles its own videoCache + channels queries per video (intentional N+1).
- The reCache `id=="all"` path deletes the entire videoCache and refills it in two passes: `fillVideoCache` for each channel where `fullyAllowed` is true, then `fillVideoCacheFromWhitelist()`, which iterates the whitelist (skipping blacklisted videos) and adds those videos to the videoCache. Whitelisted videos from non-fullyAllowed channels are therefore NOT excluded from bulk reCache — they're covered by the whitelist pass.
