/**
 * Backend origin, selected by build mode — the SINGLE source of truth shared by the runtime
 * (`shared/sensor-api.ts`) and the manifest `host_permissions` (`wxt.config.ts`), so the two can
 * never drift. Kept free of `import.meta`/WXT globals so `wxt.config.ts` can import it at config time.
 *
 * Dev build → the local Next.js ingestion server (port 3000 — NOT the Supabase 54321 port).
 * Distribution build → the hosted EU backend.
 */
export const LOCAL_BACKEND_ORIGIN = 'http://127.0.0.1:3000';

// TODO(FSC-107): set the real hosted EU origin before shipping a distribution build.
export const HOSTED_BACKEND_ORIGIN = 'https://hanabi-radar.example';

/** Pick the backend origin for the current build. `isProduction` = `wxt build|zip` / `import.meta.env.PROD`. */
export function backendOrigin(isProduction: boolean): string {
  return isProduction ? HOSTED_BACKEND_ORIGIN : LOCAL_BACKEND_ORIGIN;
}
