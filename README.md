# Hanabi Radar — Extension

Browser extension that **passively** captures LinkedIn feed posts for the Hanabi
collective. It only reads what a logged-in "sensor" — a collective member running the
extension — already sees while scrolling. **No automation, no clicks, no private data
beyond what a feed post renders.** Captured posts are forwarded to the Hanabi backend
(separate repo `Hanabi-app`).

Built with [WXT](https://wxt.dev) (Manifest V3, Chromium target) in strict TypeScript.

> Status: **feed capture implemented** (FSC-110) against LinkedIn's 2026 Server-Driven-UI
> feed. Capture is **off by default** and starts only after consent (FSC-111 adds the UI).
> The background send-queue to the ingestion API is a later ticket.

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

Capture is gated on consent (safe by default). To exercise it before the FSC-111
onboarding screen exists, set the flag from the extension's **service-worker** devtools
console:

```js
chrome.storage.local.set({ 'hanabi:consentGranted': true });
```

Captured posts are logged by the background worker (`[hanabi] captured …`).

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
(the connection who surfaced the post), and `comments[]` (commenter + text). `post_type`
reliably detects `video`.

**Best-effort / tracked follow-ups** (default until a durable SDUI anchor is found):
`comment_count`, `author_degree`, `posted_at_raw`, repost provenance (original author),
`author_company` / `author_title`, `media_title`, and `image` / `multi_image` / `document`
/ `poll` / `article` `post_type`.

The selector/anchor conventions live in `entrypoints/content/feed/selectors.ts`; the fragile
DOM knowledge is isolated there and in `feed/react-urn.ts` so a LinkedIn change is a
localized fix.

## Project structure

```
entrypoints/
  background/index.ts          # service worker: receives captures (send-queue is a later ticket)
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
shared/
  payload.ts                   # PostPayload + CommentSignal (contract SSOT)
  messages.ts                  # typed content → background messaging
  window-bridge.ts             # MAIN ↔ ISOLATED postMessage protocol
  consent.ts                   # storage-backed consent flag (default off)
  log.ts                       # '[hanabi]' logging
wxt.config.ts                  # manifest (permissions: ['storage']) + WXT config
```

## Quality gates

- **ESLint (flat config) + Prettier** — formatting and linting are enforced by tooling.
- **Vitest** — the extraction logic is pure and unit-tested (happy-dom for DOM fixtures,
  `fakeBrowser` for messaging). Selectors are validated against the live feed, not snapshot-tested.
- **commitlint + husky + lint-staged** — non-conforming commit messages or staged code are
  blocked before commit. Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- **CI** (GitHub Actions) runs lint, typecheck, test and build on every push and PR.
