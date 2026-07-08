# Hanabi Radar — Extension

Browser extension that **passively** captures LinkedIn feed posts for the Hanabi
collective. It only reads what a logged-in "sensor" — a collective member running the
extension — already sees while scrolling. **No automation, no clicks, no private data.**
Captured posts are forwarded
to the Hanabi backend (separate repo `Hanabi-app`).

Built with [WXT](https://wxt.dev) (Manifest V3, Chromium target) in strict TypeScript.

> Status: **technical foundation** (FSC-87). Capture logic is not implemented yet.

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
hot-reloads on change.

### Option B — load an unpacked build manually

```sh
pnpm build
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select the build output directory: **`.output/chrome-mv3`**.

The extension appears in the list; reload it after each `pnpm build`.

## Scripts

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Dev build + auto-loaded Chrome with HMR  |
| `pnpm build`        | Production build to `.output/chrome-mv3` |
| `pnpm zip`          | Package a distributable zip              |
| `pnpm typecheck`    | `wxt prepare` + `tsc --noEmit`           |
| `pnpm lint`         | ESLint over the project                  |
| `pnpm lint:fix`     | ESLint with autofix                      |
| `pnpm format`       | Prettier write                           |
| `pnpm format:check` | Prettier check (no writes)               |
| `pnpm test`         | Run the Vitest suite once                |
| `pnpm test:watch`   | Vitest in watch mode                     |

## Project structure

```
entrypoints/
  background/index.ts   # service worker (send-queue / auth — later)
  content/index.ts      # LinkedIn feed content script (capture — later)
wxt.config.ts           # manifest + WXT config
```

## Quality gates

- **ESLint (flat config) + Prettier** — formatting and linting are enforced by tooling.
- **commitlint + husky + lint-staged** — non-conforming commit messages or staged code
  are blocked before the commit is created. Commits follow
  [Conventional Commits](https://www.conventionalcommits.org/).
- **CI** (GitHub Actions) runs lint, typecheck, test and build on every push and PR.
