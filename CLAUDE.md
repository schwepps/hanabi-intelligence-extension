# CLAUDE.md — Hanabi-extension

> Concise by design: the linter owns style, this file owns commands, architecture, and
> guardrails. Keep it in sync with reality; delete anything that goes stale.

## Context

Hanabi Radar captures LinkedIn posts for the Hanabi collective's partners. This repo = **the
browser extension**: it **passively** reads the sensor's LinkedIn feed (in their
already-logged-in session) and sends posts to the backend (separate repo `Hanabi-app`).

**No automation** — we only read what the sensor already sees while scrolling → near-zero ban
risk. The backend never talks to LinkedIn; all capture lives here.

("sensor" = a collective member who installed the extension and captures their own feed;
matches the `sensors` table in `Hanabi-app`.)

Tickets: Linear (team FSC Consulting, label `Hanabi-extension`). The MVP spec and the payload
contract live in `Hanabi-app` (contract = ticket FSC-98).

## Stack (as installed — keep in sync with `package.json`)

- **WXT 0.20** (Vite) — **Manifest V3**, Chromium target (Chrome/Edge). Entrypoints in
  `entrypoints/`; extension APIs and WXT utilities auto-import from the `#imports` virtual module.
- **TypeScript (strict)** — root `tsconfig.json` extends WXT's generated `.wxt/tsconfig.json`.
- **ESLint 10 (flat config)** + **Prettier** — formatting belongs to tooling.
- **commitlint + husky + lint-staged** — Conventional Commits, enforced pre-commit.
- **Vitest 4** via `WxtVitest()` (`fakeBrowser` mocks the extension API).
- **pnpm 10**, **Node 22** (`.nvmrc`). CI runs lint · format:check · typecheck · test · build on
  every push and PR.

## Commands

- `pnpm dev` — HMR + auto-launched Chrome with the extension loaded
- `pnpm build` / `pnpm zip` — production build to `.output/chrome-mv3` / distributable zip
- `pnpm lint` · `pnpm format` · `pnpm typecheck` · `pnpm test`
- Before a PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` must pass.

## Architecture

- **Content script** (`entrypoints/content/`): reads posts on the feed, extracts the payload,
  forwards it to the background. Injected site-wide (LinkedIn is an SPA) — gate to the feed at
  **runtime** via `window.location`, not by narrowing manifest `matches`.
- **Background service worker** (`entrypoints/background/`): send queue → ingestion API, with
  sensor auth and retry/backoff.
  - ⚠️ **MV3 workers are ephemeral** (they stop when idle). Never hold the queue in memory:
    persist it with `storage.defineItem` (`wxt/utils/storage` → `browser.storage.local`) and
    drive retry on worker wake / `browser.alarms`, not long-lived timers.
- **Typed messaging** (content → background): define the message contract first — WXT ships no
  messaging wrapper, so use `browser.runtime` or a typed lib like `@webext-core/messaging`. All
  logic flows from the contract.
- ⚠️ **Debounce the feed's `MutationObserver`** (infinite scroll): start ~800 ms and tune, or
  performance collapses.
- **Capture strategy**: DOM reading in P0 (fast). Robustness target (post-MVP) = intercept
  LinkedIn's internal **Voyager** API by injecting a `world: 'MAIN'` script (`injectScript`) that
  hooks `fetch`/XHR. Don't over-invest in DOM parsing before the concept is validated.
- **Env-configurable backend**: dev build → local backend (Docker / local Supabase), distribution
  build → hosted EU backend. Select via WXT modes + `import.meta.env`. **Never hardcode the endpoint.**

## Payload contract (source of truth in `Hanabi-app`, FSC-98 — conform strictly, invent nothing)

Per post: `linkedin_post_id`, `text`, `url`, `author_name`, `author_company`, `author_title`,
`author_profile_url`, `author_type`, `post_type`, `is_repost`, `original_author_name`,
`original_author_profile_url`, `media_title`, `hashtags[]`, `reaction_count`, `comment_count`,
`posted_at_raw`, `captured_at`, `author_degree`, `social_proof`.

- **`post_type`** (text | image | multi_image | video | document | poll | article): document/
  carousel and video posts carry their substance outside the text — without the format the
  classifier bins them as noise.
- **Reposts**: extract the _original_ author, not the resharer, or outreach targets the wrong person.
- **Two warm-intro signals** — capture both: `author_degree` (author's connection degree to the
  sensor) and `social_proof` (the 1st-degree connection whose engagement surfaced the post).
  Neither is reconstructable later.
- **Timestamps**: LinkedIn shows relative times ("2h", "1d"). Send `posted_at_raw` + `captured_at`;
  the backend derives `posted_at`.

## Guardrails (critical)

- **Strictly passive.** No automated LinkedIn action: no auto-scroll, clicks, login, or messaging.
  We read what the sensor already sees.
- **No private data.** Never capture messages, notifications, or the connection graph — only what
  LinkedIn renders on a feed post. Nuance: reading the degree badge ("2nd") next to an author **is**
  allowed (one enum, one visible post); **enumerating the sensor's connections is not** — never
  crawl the connections list to resolve degrees.
- **Consent before capture** (FSC-111): first-launch screen explaining what's captured, why, and
  opt-out; capture starts only after explicit agreement.
- **Minimal permissions**: limit to `linkedin.com`; no broad permission (`<all_urls>`, `tabs`…)
  without real need; prefer targeted injection.
- **Secrets out of code**: endpoint and public keys via env/modes, never a backend secret in the extension.

## Do not

- Do not automate any LinkedIn interaction, even "to go faster".
- Do not widen manifest permissions for convenience.
- Do not diverge from the payload contract without updating `Hanabi-app` in parallel.
- Do not add a heavy UI framework — the UI is limited to onboarding/consent.
