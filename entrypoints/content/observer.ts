/**
 * Debounced feed observer. LinkedIn's infinite scroll fires MutationObserver constantly; without
 * debouncing, extraction would run on every mutation and performance collapses (~800 ms is the
 * tuned starting point per the ticket + CLAUDE.md). This module is a "dumb" change signal — it
 * batches bursts and calls `onSettled` once things go quiet; it does no extraction (SRP).
 */

/** Default debounce for the feed observer (ms). */
export const FEED_OBSERVER_DEBOUNCE_MS = 800;

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel: () => void;
}

/** Trailing-edge debounce: `fn` runs once, `delayMs` after the last call. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  };
  debounced.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  return debounced;
}

export interface FeedObserver {
  disconnect: () => void;
}

/** Observe `target` for child/subtree mutations, calling `onSettled` after each quiet period. */
export function createFeedObserver(
  target: Node,
  onSettled: () => void,
  debounceMs: number = FEED_OBSERVER_DEBOUNCE_MS,
): FeedObserver {
  const settled = debounce(onSettled, debounceMs);
  const observer = new MutationObserver(() => settled());
  observer.observe(target, { childList: true, subtree: true });
  return {
    disconnect: () => {
      settled.cancel();
      observer.disconnect();
    },
  };
}
