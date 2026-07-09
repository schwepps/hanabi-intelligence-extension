import { defineConfig } from 'wxt';
import { backendOrigin } from './shared/backend';

// See https://wxt.dev/api/config.html
export default defineConfig({
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
    // `storage` backs the consent flag + linked sensor identity (see shared/consent.ts, shared/identity.ts).
    permissions: ['storage'],
    // Narrow: only the backend origin the onboarding page calls to validate the token + record consent
    // (GET /api/sensor/me, POST /api/sensor/consent — FSC-98/FSC-111). The send-queue reuses this host.
    host_permissions: [`${backendOrigin(mode === 'production')}/*`],
  }),
  imports: {
    // Emit a flat-config file (.wxt/eslint-auto-imports.mjs) exposing WXT's auto-imported
    // globals. `9` is ESLint's flat-config format version (compatible with ESLint 9 and 10),
    // not the ESLint major this project depends on.
    eslintrc: {
      enabled: 9,
    },
  },
});
