/**
 * Sensor identity — the link between this install and the sensor's backend identity.
 * `token` is the raw ingestion bearer credential; it authenticates every submission and the
 * send-queue (later ticket) reads it from here. Persisted in `browser.storage.local` (isolated from
 * web pages, survives worker restarts). Cleared identity ⇒ the sensor must (re)link via onboarding.
 */
import type { SensorProfile } from './sensor-api';

export interface SensorIdentity {
  /** Raw ingestion token — sent as `Authorization: Bearer <token>`. */
  token: string;
  id: string;
  name: string;
  email: string;
  /** Epoch ms when the sensor linked this install. */
  linkedAt: number;
}

export const sensorIdentity = storage.defineItem<SensorIdentity | null>(
  'local:hanabi:sensorIdentity',
  { fallback: null },
);

/** Minimum plausible token length — rejects blank/typo pastes before hitting the network. */
const MIN_TOKEN_LENGTH = 8;

/** Pure: trim a pasted token and reject blanks / too-short values. Returns `null` when unusable. */
export function normalizeToken(raw: string): string | null {
  const token = raw.trim();
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
}

/** Persist the linked identity from a validated token + its backend profile. */
export async function linkSensor(token: string, profile: SensorProfile): Promise<void> {
  await sensorIdentity.setValue({
    token,
    id: profile.id,
    name: profile.name,
    email: profile.email,
    linkedAt: Date.now(),
  });
}
