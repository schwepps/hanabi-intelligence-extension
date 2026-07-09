/**
 * Persistent "already sent" set — a durable analogue of the content script's volatile `DedupStore`
 * (`entrypoints/content/dedup.ts`). It closes the hole that store leaves: a tab reload wipes the
 * in-memory dedup set, so the same post would be re-sent. This set lives in `storage.local`, keyed on
 * `linkedin_post_id`, so it survives worker restarts and tab reloads.
 *
 * Like `DedupStore`, it is capped with FIFO eviction — an evicted id only risks a re-send that the
 * backend's idempotent upsert collapses (the backend is the authoritative dedup). Only the
 * single-flight drain writes it, so no lock is needed here; callers serialize via the queue lock.
 */

/** Ids the backend has confirmed (2xx). Insertion-ordered; oldest first. */
export const sentIds = storage.defineItem<string[]>('local:hanabi:sentIds', { fallback: [] });

/** Cap on remembered ids (mirrors `DedupStore` DEFAULT_MAX_ENTRIES). */
export const MAX_SENT_IDS = 5000;

/** Whether `id` has already been confirmed by the backend. */
export async function hasSent(id: string): Promise<boolean> {
  return (await sentIds.getValue()).includes(id);
}

/** Record confirmed ids, de-duplicating and FIFO-evicting the oldest past the cap. */
export async function markSent(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const merged = (await sentIds.getValue()).slice();
  for (const id of ids) {
    if (!merged.includes(id)) merged.push(id);
  }
  const trimmed =
    merged.length > MAX_SENT_IDS ? merged.slice(merged.length - MAX_SENT_IDS) : merged;
  await sentIds.setValue(trimmed);
}
