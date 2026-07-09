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

- **Feed is Server-Driven UI (2026).** The feed is a virtualized `LazyColumn` under
  `[data-testid="mainFeed"]`; the classic `feed-shared-*` / `update-components-*` / `data-urn` markup
  is gone and no client surface exposes a clean data model. Capture reads the _rendered_ feed across
  two worlds (see `README.md` → "How capture works"):
- **MAIN-world reader** (`entrypoints/feed-reader.content.ts`, `world: 'MAIN'`, `document_idle`): runs
  in the page context to read each post's activity URN (dedup key) from the node's **React props** —
  it is in no DOM attribute — plus the other fields from the rendered DOM. Relays slim payloads over a
  `window.postMessage` bridge (`shared/window-bridge.ts`).
- **Content script** (`entrypoints/content/`, isolated): owns consent + the feed gate, de-dups by
  post id, forwards to the background. Injected site-wide (LinkedIn is an SPA) — gate to the feed at
  **runtime** via `window.location`, not by narrowing manifest `matches`. The fragile DOM knowledge
  is isolated in `content/feed/selectors.ts` + `feed/react-urn.ts` so a LinkedIn change is a localized fix.
- **Background service worker** (`entrypoints/background/`, FSC-112): a durable send-queue that POSTs
  captured posts to the ingestion API (`POST /api/ingest`, batch envelope) authenticated with the
  sensor token, with retry/backoff and persistent dedup. `index.ts` is pure wiring; logic is split by
  responsibility — `queue.ts` (persistent FIFO + write mutex), `sent-ids.ts` (dedup), `send.ts` (batch
  POST + response classification), `backoff.ts` / `scheduler.ts` (backoff over `browser.alarms`),
  `drain.ts` (the state machine). Opt-out clears the queue and aborts any in-flight batch.
  - ⚠️ **MV3 workers are ephemeral.** The queue lives in `storage.local` (`storage.defineItem`), never
    in memory; an entry is removed only on a confirmed 2xx; retry is driven by `browser.alarms` /
    worker wake, not long-lived timers.
  - ⚠️ **No CORS on the backend** — the ingest POST must run from the background worker (it holds
    `host_permissions`); a content-script fetch would be blocked.
- **Typed messaging** (content → background, `shared/messages.ts`): a hand-typed wrapper over
  `browser.runtime` (fire-and-forget `postCaptured`) — WXT ships no messaging wrapper; migrate to a
  protocol-map lib (`@webext-core/messaging`) only if the protocol grows beyond one message.
- ⚠️ **Debounce the feed's `MutationObserver`** (infinite scroll): ~800 ms (`content/observer.ts`),
  or performance collapses.
- **Capture strategy (validated against the live SDUI feed).** Extract from the _rendered_ DOM +
  the React-props URN — NOT from the raw network payload. The feed streams a React-Server-Components
  "flight" of `proto.sdui.*` UI components (TextModels/bindings), not data entities, so parsing it is
  _more_ brittle than reading the browser-resolved DOM. **Ground every selector in live recon** (drive
  the sensor's own feed read-only); treat class names as untrusted and anchor on `data-testid` /
  `aria-label` / href paths / localized verb text. Add fields only when validated on the live feed.
- **Env-configurable backend** (`shared/backend.ts`, single source): the origin follows the build mode
  via `backendOrigin(import.meta.env.PROD)` — dev → local (`http://127.0.0.1:3000`), distribution →
  hosted EU — and the manifest `host_permissions` derive from the same function so they can't drift.
  **Never hardcode the endpoint at a call site.** The hosted origin is a placeholder until FSC-107; a
  `zip:start` guard fails `pnpm zip` on it so no distribution ships against it.

## Payload contract (source of truth in `Hanabi-app`, FSC-98 — conform strictly, invent nothing)

Per post: `linkedin_post_id`, `text`, `url`, `author_name`, `author_company`, `author_title`,
`author_profile_url`, `author_type`, `post_type`, `is_repost`, `original_author_name`,
`original_author_profile_url`, `media_title`, `hashtags[]`, `reaction_count`, `comment_count`,
`posted_at_raw`, `captured_at`, `author_degree`, `social_proof`.

The wire shape sent to `POST /api/ingest` is the batch envelope `{ version: 1, posts: [...] }`;
`shared/ingestion.ts` projects each `PostPayload` onto the exact backend-accepted fields via an
allowlist (`INGEST_POST_KEYS`, excludes `comments` — see below). The backend upserts idempotently on
`linkedin_post_id`, so re-sending is safe; a 422 rejects the whole batch, so the allowlist must match
the backend schema exactly.

- **`post_type`** (text | image | multi_image | video | document | poll | article): document/
  carousel and video posts carry their substance outside the text — without the format the
  classifier bins them as noise.
- **Reposts**: extract the _original_ author, not the resharer, or outreach targets the wrong person.
- **Two warm-intro signals** — capture both: `author_degree` (author's connection degree to the
  sensor) and `social_proof` (the 1st-degree connection whose engagement surfaced the post).
  Neither is reconstructable later.
- **Timestamps**: LinkedIn shows relative times ("2h", "1d"). Send `posted_at_raw` + `captured_at`;
  the backend derives `posted_at`.
- **Comments (captured, not yet transmitted):** visible preview comments are captured as `comments[]`
  (`{ author_name, author_profile_url, text }`) — a warm-intro signal (who engaged, and how). The send
  path **strips `comments` until the backend accepts it** (excluded from the wire allowlist; the queue
  also drops them at rest — data minimization). End-to-end support is tracked in **FSC-114**; FSC-111
  consent copy already covers commenter data.
- **Field confidence on the 2026 SDUI feed** (validated live): production-grade = `linkedin_post_id`
  (+ derived `url`), author name/profile_url/type, `author_degree` (name badge, FSC-116), `text`,
  `reaction_count`, `hashtags`, `social_proof`, `comments`, `posted_at_raw` (FSC-118),
  `post_type` ∈ {video, document, article} + `media_title` (document badge, FSC-117), and repost
  provenance (`is_repost` + `original_author_*`, FSC-115). Best-effort = `author_company`/`title`
  (headline `chez`/`at`/`@` split, FSC-118 — FR headlines are noisy taglines, so null unless a clear
  delimiter). Deferred (safe default until a durable anchor lands) = `comment_count`, and `post_type`
  image/multi_image/poll — no reliable SDUI anchor (content `<img>`s report width 0 / are background
  images; `role="radio"` is not poll-specific), and kept conservative `text` because `post_type` is
  **immutable at ingest** (first-capture-wins) so a mistype is permanent. `author_degree` reads only
  the rendered badge ("• 2e" inside the name link, stripped off `author_name`) — never the connection
  list (guardrail). `social_proof` comes from the context header ("X a aimé/commenté ceci") and the
  author is taken from the actor block excluding that header, so a surfaced post attributes to the
  poster, not the surfacing connection — and `author_degree` is the poster's own, independent of it.
- **Repost provenance** (`resolveRepost` in `feed/fields.ts`, FSC-115): the original author is captured
  for both reshare shapes, never the resharer — a plain reshare ("X a republié ceci") renders the
  original below the header so `author` (header excluded) already IS the original; a quote-repost
  (reshare-with-thoughts) carries the original inside an embedded card anchored on its `/feed/update/`
  link (`findResharedCard`). If the original author can't be resolved, the post is downgraded to
  `is_repost:false` — never a resharer-attributed repost (the backend refine requires a non-null
  `original_author_name`). The quote-repost anchor is grounded on a live reshare permalink and validated
  absent from 70+ live feed posts; in-feed quote-repost rendering is pending re-confirmation.

## Guardrails (critical)

- **Strictly passive.** No automated LinkedIn action: no auto-scroll, clicks, login, or messaging.
  We read what the sensor already sees.
- **No private data.** Never capture messages, notifications, or the connection graph — only what
  LinkedIn renders on a feed post. Nuance: reading the degree badge ("2nd") next to an author **is**
  allowed (one enum, one visible post); **enumerating the sensor's connections is not** — never
  crawl the connections list to resolve degrees.
- **Consent before capture** (FSC-111): first-launch screen explaining what's captured, why, and
  opt-out; capture starts only after explicit agreement.
- **Minimal permissions**: declared permissions are `storage` (consent, sensor identity, send-queue)
  and `alarms` (send-queue retry — the only MV3-durable wake, no user-facing warning); `host_permissions`
  is the single backend origin. No broad permission (`<all_urls>`, `tabs`…) without real need.
- **Secrets out of code**: endpoint and public keys via env/modes, never a backend secret in the extension.

## Do not

- Do not automate any LinkedIn interaction, even "to go faster".
- Do not widen manifest permissions for convenience.
- Do not diverge from the payload contract without updating `Hanabi-app` in parallel.
- Do not add a heavy UI framework — the UI is limited to onboarding/consent.
