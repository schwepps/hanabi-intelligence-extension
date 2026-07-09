/**
 * Retry backoff — pure delay math + the one persisted counter it needs.
 *
 * The failure streak lives in `storage.local` so backoff survives the ephemeral MV3 worker being
 * killed between retries. Only the (single-flight) drain mutates it, so no lock is required.
 */

/** Persisted count of consecutive failed drain cycles. Reset to 0 on any success. */
export const sendRetry = storage.defineItem<{ failureStreak: number }>('local:hanabi:sendRetry', {
  fallback: { failureStreak: 0 },
});

/** First-retry delay and the floor Chrome enforces on alarms (~30 s). */
const BASE_SECONDS = 30;
/** Cap so a long outage doesn't stretch retries past an hour. */
const MAX_SECONDS = 3600;

/**
 * Exponential backoff with jitter, returned in MINUTES (the unit `browser.alarms` takes).
 * `30 · 2^(streak-1)` seconds, capped at 1 h, multiplied by a `[0.5, 1]` jitter factor to avoid a
 * thundering herd across sensors, then floored at 30 s so it never undershoots the alarm minimum.
 * `rng` is injectable for deterministic tests.
 */
export function computeDelayMinutes(streak: number, rng: () => number = Math.random): number {
  const exponent = Math.max(1, streak) - 1;
  const capped = Math.min(MAX_SECONDS, BASE_SECONDS * 2 ** exponent);
  const jittered = capped * (0.5 + rng() * 0.5);
  return Math.max(BASE_SECONDS, jittered) / 60;
}

/** Increment the failure streak, persist it, and return the new value. */
export async function nextStreak(): Promise<number> {
  const streak = (await sendRetry.getValue()).failureStreak + 1;
  await sendRetry.setValue({ failureStreak: streak });
  return streak;
}

/** Reset the failure streak after a successful drain. */
export async function resetStreak(): Promise<void> {
  await sendRetry.setValue({ failureStreak: 0 });
}
