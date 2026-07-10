import { defineConfig } from 'wxt';
import { backendOrigin, HOSTED_BACKEND_ORIGIN } from './shared/backend';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // Pin the dev server off 3000: `next dev` (the radar backend) owns 3000, which the extension
  // calls as its backend origin (shared/backend.ts). Both `wxt dev` and `next dev` default to
  // 3000, so without this the two race for the port and the extension hits the wrong server.
  dev: {
    server: { port: 3001 },
  },
  // `manifest` is a function of the build env so `host_permissions` follows the build MODE — dev
  // (`pnpm dev`, mode 'development') → local backend, distribution (`build`/`zip`, mode 'production')
  // → hosted. Keyed on `mode` (NOT `command`) to match the runtime base URL in shared/sensor-api.ts:
  // `import.meta.env.PROD` also derives from the mode, so the manifest grant and the fetch target
  // stay aligned even under a `--mode` override. Origins come from shared/backend.ts (one source).
  manifest: ({ mode }) => ({
    name: 'Hanabi Radar',
    description:
      'Passively captures LinkedIn feed posts for the Hanabi collective. Read-only, no automation.',
    // Minimal by design: a declared content-script `matches` is enough to inject.
    // `storage` backs the consent flag + linked sensor identity + the send queue (shared/consent.ts,
    // shared/identity.ts, background/queue.ts). `alarms` drives the send-queue retry backoff
    // — the only MV3-durable wake primitive; no user-facing permission warning.
    permissions: ['storage', 'alarms'],
    // Narrow: only the backend origin the onboarding page and the send-queue call
    // (GET /api/sensor/me, POST /api/sensor/consent, POST /api/ingest).
    host_permissions: [`${backendOrigin(mode === 'production')}/*`],
  }),
  hooks: {
    // Refuse to produce a distribution ZIP (`pnpm zip`, mode 'production') while the hosted origin is
    // still the hosted-origin placeholder — a hard stop beats shipping an extension that posts to a backend
    // that doesn't exist. Gated on `zip:start` (the actual release artifact), NOT `build:before`, so
    // CI's `pnpm build`, `pnpm dev`, and `wxt prepare`/typecheck are all unaffected.
    'zip:start': (wxt) => {
      if (wxt.config.mode === 'production' && HOSTED_BACKEND_ORIGIN.endsWith('.example')) {
        throw new Error(
          `Refusing to zip: hosted backend origin is still the placeholder "${HOSTED_BACKEND_ORIGIN}". ` +
            'Set the real EU origin in shared/backend.ts.',
        );
      }
    },
  },
  imports: {
    // Emit a flat-config file (.wxt/eslint-auto-imports.mjs) exposing WXT's auto-imported
    // globals. `9` is ESLint's flat-config format version (compatible with ESLint 9 and 10),
    // not the ESLint major this project depends on.
    eslintrc: {
      enabled: 9,
    },
  },
});
