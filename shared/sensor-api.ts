/**
 * Sensor identity API client (FSC-98). Talks to the backend's onboarding endpoints so the extension
 * can (1) validate a pasted ingestion token and read back who the sensor is, and (2) record the
 * sensor's GDPR consent server-side. The raw token is sent as `Authorization: Bearer <token>`; the
 * backend hashes it (SHA-256) and matches `sensors.token_hash` — the extension never hashes.
 *
 * MUST be called from a privileged extension context (the onboarding page or the background worker)
 * that holds `host_permissions` for the backend origin — the backend sets no CORS headers, so a
 * content-script call would fail. The send-queue (later ticket) reuses this module from the background.
 */
import { backendOrigin } from './backend';

/** Sensor identity as returned by `GET /api/sensor/me`. */
export interface SensorProfile {
  id: string;
  name: string;
  email: string;
  consented_at: string | null;
}

const BASE_URL = backendOrigin(import.meta.env.PROD);

/**
 * Validate a raw sensor token and read back the identity + consent status.
 * Returns the profile on success, `null` when the token is invalid/inactive (HTTP 401). Throws on
 * network failure or any other non-OK status, so the caller can tell "wrong token" (retry the field)
 * from "server unreachable" (retry later).
 */
export async function fetchSensorProfile(token: string): Promise<SensorProfile | null> {
  const res = await fetch(`${BASE_URL}/api/sensor/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/sensor/me failed: ${res.status}`);
  return (await res.json()) as SensorProfile;
}

/**
 * Record the sensor's consent server-side (sets `sensors.consented_at`; idempotent). Returns the
 * effective consent timestamp. Throws on any non-OK status — onboarding must NOT finalize consent
 * locally if the server did not record it.
 */
export async function recordSensorConsent(token: string): Promise<string> {
  // No request body — the sensor is identified by the bearer token alone (FSC-98). Deliberately omit
  // `Content-Type: application/json`: declaring a JSON body without sending one can trip middleware
  // that tries to parse it.
  const res = await fetch(`${BASE_URL}/api/sensor/consent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`POST /api/sensor/consent failed: ${res.status}`);
  return ((await res.json()) as { consented_at: string }).consented_at;
}
