import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Hanabi Radar',
    description:
      'Passively captures LinkedIn feed posts for the Hanabi collective. Read-only, no automation.',
    // Minimal by design: a declared content-script `matches` is enough to inject.
    // `host_permissions` for the ingestion API are added when the send-queue lands.
    permissions: [],
    host_permissions: [],
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
