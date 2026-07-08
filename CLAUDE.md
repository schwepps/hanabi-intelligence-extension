# CLAUDE.md — Hanabi-extension

> Concise by design (~100 lines): the linter owns style, this file owns commands, architecture, and guardrails.

## Context

Hanabi Radar captures LinkedIn posts for the Hanabi collective's partners. This repo = **the browser extension**: it **passively** reads the sensor's LinkedIn feed (in their already-logged-in session) and sends posts to the backend (separate repo `Hanabi-app`).

Model inspired by Tarss: **no automation** — we only read what the user already sees while scrolling → near-zero ban risk. The backend never talks to LinkedIn; all capture lives here.

Full spec: see `docs/Hanabi-Radar-Documentation-MVP.md`. Tickets: Linear, team FSC Consulting, label `Hanabi-extension`.

("sensor" = a collective member who has the extension installed and captures their feed. Matches the `sensors` table in `Hanabi-app`.)

## Stack

- **WXT** (extension framework, Vite) — **Manifest V3** by default, Chromium target (Chrome/Edge).
- **Strict TypeScript**.
- WXT structure: entrypoints (`entrypoints/content/`, `entrypoints/background/`), auto-imports of extension APIs.

## Commands

> Use **pnpm**. Check `package.json` if a command differs.

- Dev (HMR + auto-reloaded extension): `pnpm dev`
- Build: `pnpm build`
- Distribution package: `pnpm zip`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck` (or `pnpm compile`)
- Tests: `pnpm test`

Before a PR: `pnpm lint && pnpm typecheck && pnpm build` must pass.

## Architecture & conventions

- **Content script** (`entrypoints/content/`): detects posts shown in the `linkedin.com/feed`, extracts the minimal payload, forwards it to the background.
- **Background / service worker** (`entrypoints/background/`): send queue to the ingestion API, with sensor authentication and retry/backoff.
- **Type-first messaging**: define message types (content → background) first. All logic flows from there.
- ⚠️ **Debounce the feed's `MutationObserver`** (LinkedIn is infinite scroll) — otherwise performance collapses. Start around **~800 ms** and tune.
- **DOM reading in P0** (fast); intercepting the internal Voyager API is the robustness target (post-MVP). Do not over-invest in DOM parsing before the concept is validated.
- **The payload contract is the source of truth and lives in the `Hanabi-app` repo (ticket FSC-98)**. Per post: `linkedin_post_id`, `text`, `url`, `author_name`, `author_company`, `author_title`, `author_profile_url`, `author_type`, `post_type`, `is_repost`, `original_author_name`, `original_author_profile_url`, `media_title`, `hashtags[]`, `reaction_count`, `comment_count`, `posted_at_raw`, `captured_at`, `author_degree`, `social_proof`. Conform strictly; do not invent fields.
- **Capture `post_type`** (text | image | multi_image | video | document | poll | article). Document/carousel and video posts hold their substance outside the text — without the format, the classifier bins them as noise.
- **Reposts**: detect them and extract the _original_ author, not the resharer. Otherwise outreach targets the wrong person.
- **Two warm-intro paths** — capture both: the author's connection degree relative to the sensor (`author_degree`), and, when the post surfaced because a 1st-degree connection engaged with it, that person's name (`social_proof`). Neither can be reconstructed later.
- **Timestamps**: LinkedIn renders relative times ("2h", "1d"). Send `posted_at_raw` + `captured_at`; the backend derives `posted_at`.
- **Environment-configurable backend**: the dev build targets the local backend (Docker / local Supabase stack), the distribution build targets the hosted EU backend. Select via WXT modes/env vars — **never hardcode the endpoint**.

## Guardrails (critical)

- **Capture is strictly passive.** No automated action on LinkedIn: no auto-scroll, no clicks, no login, no message sending. We read what the sensor already sees.
- **No private data.** Never capture messages, notifications, or the connection graph. Only what LinkedIn already renders on a feed post. Nuance: reading the degree badge ("2nd") shown next to an author **is** allowed — that's one enum for one visible post. **Enumerating the sensor's connections is not.** Never crawl the connections list to resolve degrees.
- **Consent before capture.** On first launch, a screen explaining what is captured, the purpose, and opt-out; capture only starts after explicit agreement (ticket FSC-111).
- **Minimal permissions** in the manifest: limit to `linkedin.com`. No broad permission (`<all_urls>`, `tabs`…) without real need. Prefer targeted injection.
- **Secrets out of code**: endpoint and public keys via config/env, never a backend secret in the extension.

## Code quality

- **Strict TypeScript**, no unjustified `any`.
- **ESLint (flat config)** + **Prettier** (formatting belongs to tooling).
- **Conventional commits** (commitlint + husky). One PR = one Linear ticket, green CI before merge.
- Test critical logic: payload extraction (contract conformance), send queue/retry, consent gating.

## Do not

- Do not automate any LinkedIn interaction, even "to go faster".
- Do not widen manifest permissions for convenience.
- Do not diverge from the payload contract without updating `Hanabi-app` in parallel.
- Do not add a heavy UI framework: the UI is limited to onboarding/consent.
