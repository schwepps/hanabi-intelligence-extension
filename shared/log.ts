/**
 * Minimal `[hanabi]`-prefixed logging — one toggle point for the whole extension.
 * `no-console` is intentionally allowed by the lint config; keep this to debug/warn only
 * (never per-post error spam). Rich telemetry (selector-drift metrics sent to the backend) is
 * post-MVP — there is no ingestion endpoint yet.
 */
const PREFIX = '[hanabi]';

export function logDebug(...args: unknown[]): void {
  console.debug(PREFIX, ...args);
}

export function logWarn(...args: unknown[]): void {
  console.warn(PREFIX, ...args);
}
