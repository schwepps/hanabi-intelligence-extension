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
    // Generate an ESLint 9 flat-config file exposing WXT's auto-imported globals.
    eslintrc: {
      enabled: 9,
    },
  },
});
