# Hanabi Radar — Extension

Browser extension that **passively** captures LinkedIn feed posts for the Hanabi
collective. It only reads what a logged-in "sensor" — a collective member running the
extension — already sees while scrolling. **No automation, no clicks, no private data
beyond what a feed post renders.** Captured posts are forwarded to the Hanabi backend
(separate repo `Hanabi-app`).

Built with [WXT](https://wxt.dev) (Manifest V3, Chromium target) in strict TypeScript.

> Status: **feed capture** (FSC-110), **onboarding + consent** (FSC-111), and the **authenticated
> send-queue** (FSC-112) are implemented against LinkedIn's 2026 Server-Driven-UI feed. Capture is
> **off by default** and starts only after the sensor consents; captured posts are queued in the
> background worker and POSTed to the ingestion API with retry/backoff and dedup.

## Prerequisites

- **Node.js ≥ 22** (see `.nvmrc`)
- **pnpm 10** — enable via Corepack: `corepack enable`

## Setup

```sh
pnpm install
```

`postinstall` runs `wxt prepare`, which generates the `.wxt/` types and the ESLint
auto-imports config. `prepare` installs the Git hooks (husky).

## Run the extension locally

### Option A — dev mode with HMR (recommended)

```sh
pnpm dev
```

WXT builds the extension, launches a fresh Chrome instance with it already loaded, and
hot-reloads on change. Log into LinkedIn in that instance and open the feed.

**Onboarding** opens automatically on first install: paste a sensor token, which the extension
validates against the backend and then records consent. This requires the ingestion backend
(`Hanabi-app`) running locally on `http://127.0.0.1:3000` with a seeded sensor row (matching
`token_hash`, `active`, consented). Once linked and consented, scrolling the feed captures posts,
which the background worker batches and POSTs to `/api/ingest` — watch the Network tab / backend, or
the `[hanabi]` service-worker logs.

To smoke-test **capture only** without a backend, flip the consent flag from the extension's
**service-worker** devtools console:

```js
chrome.storage.local.set({ 'hanabi:consentGranted': true });
```

Posts are still captured and enqueued; sends fail and retry (with backoff) until a backend is
reachable — nothing is lost.

### Option B — load an unpacked build manually

```sh
pnpm build
```

Then in Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** →
select **`.output/chrome-mv3`**. Reload the extension after each build.

## How capture works

LinkedIn's feed is **Server-Driven UI** (a virtualized `LazyColumn` under
`[data-testid="mainFeed"]`): the classic `feed-shared-*` / `data-urn` markup is gone, and
no client surface (DOM attributes, React props, or the RSC-flight network payload) exposes
a clean data model. So capture reads two surfaces of the _rendered_ feed:

- **`entrypoints/feed-reader.content.ts` — MAIN world** (`world: "MAIN"`, `document_idle`):
  runs in the page context so it can read each post's activity URN (the dedup key) from the
  node's **React props** — it is in no DOM attribute. It extracts the other fields from the
  rendered DOM (resolved text, aria-labels, hrefs) and relays slim payloads.
- **`entrypoints/content/index.ts` — isolated world**: owns the consent + feed-URL gate,
  de-dupes by post id, and forwards to the background. It coordinates with the reader over a
  `window.postMessage` bridge (`shared/window-bridge.ts`: `hello` / `control` / `capture`).

Everything is strictly passive: the reader only observes responses/DOM the sensor's own
session already produced — no clicks, scrolls, or network calls to LinkedIn.

### Field coverage (validated against the live feed)

**Production-grade:** `linkedin_post_id` (+ derived `url`), `author_name`,
`author_profile_url`, `author_type`, `text`, `reaction_count`, `hashtags`, `social_proof`
(the connection who surfaced the post), `comments[]` (commenter + text), and repost
provenance (`is_repost` + `original_author_*` — the reshared post's original author, never
the resharer). `post_type` reliably detects `video`.

**Best-effort / tracked follow-ups** (default until a durable SDUI anchor is found):
`comment_count`, `author_degree`, `posted_at_raw`, `author_company` / `author_title`,
`media_title`, and `image` / `multi_image` / `document` / `poll` / `article` `post_type`.

The selector/anchor conventions live in `entrypoints/content/feed/selectors.ts`; the fragile
DOM knowledge is isolated there and in `feed/react-urn.ts` so a LinkedIn change is a
localized fix.

## Project structure

```
entrypoints/
  background/                  # service worker (MV3)
    index.ts                   #   wiring only: onInstalled + send-queue triggers (capture/alarm/consent)
    install.ts                 #   open onboarding on first install
    queue.ts                   #   durable FIFO queue (storage.local) + write mutex
    sent-ids.ts                #   persistent already-sent set (dedup across restarts)
    send.ts                    #   authenticated batch POST + response classification
    drain.ts                   #   drain state machine (batching, retry, opt-out abort)
    backoff.ts                 #   exponential backoff + persisted failure streak
    scheduler.ts               #   browser.alarms retry seam
  content/index.ts             # ISOLATED: consent + feed gate, dedup, forward to background
  feed-reader.content.ts       # MAIN world: React-props URN + rendered-DOM fields → bridge
  content/
    feed/                      # SDUI feed extraction (grounded in live recon)
      selectors.ts             #   anchors + localized patterns (the one fragile layer)
      nodes.ts                 #   locate the feed + delineate post nodes
      react-urn.ts             #   activity URN from React props (MAIN-world only)
      fields.ts                #   author / text / counts / hashtags / surface header / comments
      assemble.ts              #   compose a PostPayload (fail-soft; skips only when no URN)
    gate.ts                    # /feed runtime gate + SPA navigation watcher
    dedup.ts                   # per-tab dedup by post id
    observer.ts                # debounced MutationObserver helper
    parse/                     # localized number + degree parsers
  onboarding/                  # first-launch consent screen + sensor-token linking (FSC-111)
  popup/                       # capture on/off toggle + link status
shared/
  payload.ts                   # PostPayload + CommentSignal (capture contract SSOT)
  ingestion.ts                 # wire envelope + toIngestPost allowlist (strips comments)
  sensor-api.ts                # backend client: token validation + consent (fetch + Bearer)
  identity.ts                  # storage-backed sensor identity (token + profile)
  consent.ts                   # storage-backed consent flag (default off)
  backend.ts                   # backend origin by build mode (single source)
  messages.ts                  # typed content → background messaging
  window-bridge.ts             # MAIN ↔ ISOLATED postMessage protocol
  log.ts                       # '[hanabi]' logging
wxt.config.ts                  # manifest (permissions: ['storage', 'alarms']) + zip placeholder guard
```

## Quality gates

- **ESLint (flat config) + Prettier** — formatting and linting are enforced by tooling.
- **Vitest** — extraction logic and the background send-queue are unit-tested (happy-dom for DOM
  fixtures, `fakeBrowser` for storage/alarms/messaging, stubbed `fetch` for the ingestion client).
  Selectors are validated against the live feed, not snapshot-tested.
- **commitlint + husky + lint-staged** — non-conforming commit messages or staged code are
  blocked before commit. Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- **CI** (GitHub Actions) runs lint, typecheck, test and build on every push and PR.
