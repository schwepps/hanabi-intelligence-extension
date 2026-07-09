/**
 * The drain state machine — the heart of the send-queue. Pulls posts off the durable queue in
 * batches, submits them authenticated, and applies each outcome (forget / drop / retry / halt). An
 * in-worker re-entrancy guard coalesces the several drain triggers (enqueue, startup, retry alarm,
 * re-link) so they can't run two loops at once. Everything is kept in named exports so
 * `background/index.ts` stays pure wiring and this logic is unit-testable without `defineBackground`.
 */
import { consentGranted } from '@/shared/consent';
import { sensorIdentity } from '@/shared/identity';
import { BATCH_MAX_POSTS, buildBatch, MAX_BATCH_BYTES, toIngestPost } from '@/shared/ingestion';
import { logDebug, logWarn } from '@/shared/log';
import type { PostPayload } from '@/shared/payload';
import { computeDelayMinutes, nextStreak, resetStreak } from './backoff';
import { clearQueue, commitSent, dropIds, enqueue, type QueueEntry, sendQueue } from './queue';
import { clearRetry, scheduleRetry } from './scheduler';
import { submitBatch, type SubmitOutcome } from './send';

// Single worker instance ⇒ two in-memory flags are enough to serialize the drain triggers.
let isDraining = false;
let isRerunRequested = false;
// The AbortController for the batch currently on the wire, so opt-out can cancel it mid-flight.
let inFlight: AbortController | null = null;

/** Enqueue a freshly captured post and kick a drain — the warm path (worker already awake). */
export async function enqueueAndDrain(payload: PostPayload): Promise<void> {
  const added = await enqueue(payload);
  if (added) await drain();
}

/**
 * On consent revoke, clear the pending queue AND cancel any retry alarm — after opt-out nothing
 * captured is transmitted and no scheduled wake should survive. On grant, do nothing (capture resumes
 * in the content script and fresh posts kick their own drain).
 */
export async function handleConsentChange(granted: boolean): Promise<void> {
  if (granted) return;
  inFlight?.abort(); // best-effort: cancel a batch already on the wire
  await clearQueue();
  clearRetry();
}

/** Drain the queue to the backend. Re-entrant calls coalesce into one run + at most one rerun. */
export async function drain(): Promise<void> {
  if (isDraining) {
    isRerunRequested = true;
    return;
  }
  isDraining = true;
  try {
    await runDrain();
  } catch (error) {
    // A LOCAL failure (e.g. storage QuotaExceededError) must back off like a network failure, not
    // escape as an unhandled rejection that strands the queue with no scheduled retry. Guard the
    // recovery itself too, so nothing (not even a failing alarms API) can escape drain().
    logWarn('drain failed unexpectedly — scheduling retry', error);
    try {
      await scheduleRetry(computeDelayMinutes(await nextStreak().catch(() => 1)));
    } catch (scheduleError) {
      logWarn('failed to schedule retry after drain error', scheduleError);
    }
  } finally {
    isDraining = false;
    if (isRerunRequested) {
      isRerunRequested = false;
      void drain();
    }
  }
}

async function runDrain(): Promise<void> {
  let maxPosts = BATCH_MAX_POSTS; // shrinks on a 413, resets after a good send

  for (;;) {
    const token = (await sensorIdentity.getValue())?.token;
    if (!token) return; // not linked — nothing to authenticate with; resume on identity change
    if (!(await consentGranted.getValue())) return; // opt-out gate (the watcher also clears the queue)

    const queue = await sendQueue.getValue();
    if (queue.length === 0) {
      clearRetry();
      await resetStreak();
      return;
    }

    const batch = selectBatch(queue, maxPosts);
    inFlight = new AbortController();
    const outcome = await submitBatch(
      batch.map((entry) => entry.payload),
      token,
      inFlight.signal,
    );
    inFlight = null;

    // Re-check consent AFTER the round-trip: if the sensor opted out while this batch was in flight,
    // don't act on the result — don't mark it sent, don't schedule a retry. The queue was already
    // cleared by the opt-out watcher; transmit nothing further.
    if (!(await consentGranted.getValue())) return;

    const step = await applyOutcome(outcome, batch, maxPosts);
    if (step.done) return;
    maxPosts = step.maxPosts;
  }
}

/** Apply one submit outcome to the queue; returns whether the drain loop should stop and the next
 * batch ceiling. Kept small and pure-ish so the state transitions are easy to read and test. */
async function applyOutcome(
  outcome: SubmitOutcome,
  batch: QueueEntry[],
  maxPosts: number,
): Promise<{ done: boolean; maxPosts: number }> {
  switch (outcome.kind) {
    case 'ok':
      await commitSent(batch.map((entry) => entry.id));
      for (const failed of outcome.failed) logWarn('ingest isolated a post — dropped', failed);
      await resetStreak();
      return { done: false, maxPosts: BATCH_MAX_POSTS };
    case 'poison':
      await dropIds(outcome.dropIds);
      for (const id of outcome.dropIds) logWarn('ingest rejected a post (schema) — dropped', id);
      return { done: false, maxPosts };
    case 'tooLarge':
      return { done: false, maxPosts: await shrinkOrDrop(batch, maxPosts) };
    case 'transient': {
      const streak = await nextStreak();
      await scheduleRetry(computeDelayMinutes(streak));
      logDebug('ingest transient failure — retry scheduled', streak);
      return { done: true, maxPosts };
    }
    case 'halt':
      // Auth / malformed request: keep the data, cancel any timed retry (won't help until the
      // identity or the request changes); resume on `sensorIdentity.watch` / the next enqueue.
      clearRetry();
      logWarn('ingest halted (auth/request) — awaiting re-link');
      return { done: true, maxPosts };
    default:
      return assertNever(outcome);
  }
}

/** Exhaustiveness guard: a new `SubmitOutcome` variant becomes a compile error here, not a silent halt. */
function assertNever(value: never): never {
  throw new Error(`unhandled submit outcome: ${JSON.stringify(value)}`);
}

/** On a 413, halve the batch; if a lone post still overflows the body cap, drop it (can't be sent). */
async function shrinkOrDrop(batch: QueueEntry[], maxPosts: number): Promise<number> {
  if (maxPosts > 1) return Math.max(1, Math.floor(maxPosts / 2));
  const id = batch[0]?.id;
  if (id) {
    await dropIds([id]);
    logWarn('single post exceeds ingest size cap — dropped', id);
  }
  return BATCH_MAX_POSTS;
}

const encoder = new TextEncoder();
// Byte size of the empty envelope, derived from the SSOT wire builder so it can't drift from buildBatch.
const ENVELOPE_BYTES = encoder.encode(JSON.stringify(buildBatch([]))).length;

/** Take up to `maxPosts` head entries that also fit the backend body-size cap. Always ≥ 1. */
function selectBatch(queue: QueueEntry[], maxPosts: number): QueueEntry[] {
  const batch: QueueEntry[] = [];
  let bytes = ENVELOPE_BYTES;
  for (const entry of queue) {
    if (batch.length >= maxPosts) break;
    const size = encoder.encode(JSON.stringify(toIngestPost(entry.payload))).length + 1; // +1 = comma
    if (batch.length > 0 && bytes + size > MAX_BATCH_BYTES) break;
    batch.push(entry);
    bytes += size;
  }
  return batch;
}
