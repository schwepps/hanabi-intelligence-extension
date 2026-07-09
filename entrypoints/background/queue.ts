/**
 * The durable send queue. MV3 workers are ephemeral, so the queue lives in `storage.local`, never in
 * memory — an entry survives worker death and is normally removed only once the backend confirms it
 * (2xx) or a schema rejection drops it. At-least-once by design; the backend's idempotent upsert
 * collapses any re-send caused by a crash mid-flight. The one lossy exception is FIFO eviction at the
 * hard `MAX_QUEUE` cap (below): under a sustained outage of >5000 unsent posts, the oldest are dropped
 * unconfirmed to bound memory — accepted as the cap's whole point.
 */
import { logWarn } from '@/shared/log';
import type { PostPayload } from '@/shared/payload';
import { hasSent, markSent } from './sent-ids';

/** One queued post. `id === payload.linkedin_post_id` (the dedup key). */
export interface QueueEntry {
  id: string;
  payload: PostPayload;
  /** Epoch ms — observability + FIFO age. Array order is the authoritative FIFO order. */
  enqueuedAt: number;
}

export const sendQueue = storage.defineItem<QueueEntry[]>('local:hanabi:sendQueue', {
  fallback: [],
});

/** Cap so a prolonged outage can't grow the queue unbounded (mirrors `DedupStore`). */
export const MAX_QUEUE = 5000;

/**
 * Promise-chain mutex. `storage.local` is atomic per write but offers no compare-and-swap across the
 * get→mutate→set gap, so a scroll burst of concurrent enqueues would clobber each other and lose
 * posts. Funnel EVERY queue mutation through here; a single worker instance means this fully
 * serializes them. `.catch` keeps one failed mutation from wedging the chain.
 */
let tail: Promise<unknown> = Promise.resolve();
export function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => {});
  return run;
}

/** Append a post, unless it is already queued or already confirmed sent. Returns true if enqueued. */
export async function enqueue(payload: PostPayload): Promise<boolean> {
  return withQueueLock(async () => {
    const id = payload.linkedin_post_id;
    if (await hasSent(id)) return false;
    const queue = await sendQueue.getValue();
    if (queue.some((entry) => entry.id === id)) return false;

    // Drop `comments[]` before persisting: the send-time allowlist (`toIngestPost`) never transmits
    // commenter PII (deferred to FSC-114), so storing it at rest would be unused third-party data — a
    // data-minimization gap. Strip it here so the at-rest footprint matches what we actually send.
    const stored: PostPayload = { ...payload, comments: [] };
    const next = [...queue, { id, payload: stored, enqueuedAt: Date.now() }];
    while (next.length > MAX_QUEUE) {
      const dropped = next.shift();
      if (dropped) logWarn('send queue full — dropping oldest', dropped.id);
    }
    await sendQueue.setValue(next);
    return true;
  });
}

/** Remove ids from the queue AND mark them sent — one atomic step so an enqueue can't race between. */
export async function commitSent(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withQueueLock(async () => {
    const drop = new Set(ids);
    const queue = await sendQueue.getValue();
    await sendQueue.setValue(queue.filter((entry) => !drop.has(entry.id)));
    await markSent(ids);
  });
}

/** Remove ids from the queue WITHOUT marking them sent — for posts the backend permanently rejected. */
export async function dropIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withQueueLock(async () => {
    const drop = new Set(ids);
    const queue = await sendQueue.getValue();
    await sendQueue.setValue(queue.filter((entry) => !drop.has(entry.id)));
  });
}

/** Empty the queue — used on consent opt-out so nothing captured pre-opt-out is transmitted. */
export async function clearQueue(): Promise<void> {
  await withQueueLock(async () => {
    await sendQueue.setValue([]);
  });
}
