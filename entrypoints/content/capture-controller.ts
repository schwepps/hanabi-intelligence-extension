import type { PostPayload } from '@/shared/payload';
import { logWarn } from '@/shared/log';
import { DedupStore } from './dedup';
import { createFeedObserver, type FeedObserver } from './observer';

export interface CaptureControllerDeps {
  /** Locate the feed scroll container to observe; null if not mounted yet. */
  findContainer: () => Element | null;
  /** Find candidate post roots within the container. */
  findPostRoots: (container: Element) => Element[];
  /** Extract a payload from a post root; null to skip. */
  extract: (root: Element) => PostPayload | null;
  /** Emit a captured payload (e.g. send it to the background). */
  emit: (payload: PostPayload) => void;
  /** Cheap id read to pre-skip already-seen posts before the expensive full extraction. */
  readId?: (root: Element) => string | null;
  /** Observer debounce (ms); defaults to the observer module's tuned value. */
  debounceMs?: number;
  /** Bounded wait for the container to appear; injected in tests. */
  waitForContainer?: (findContainer: () => Element | null) => Promise<Element | null>;
  /** Observer factory; injected in tests to decouple from MutationObserver/timers. */
  createObserver?: (target: Element, onSettled: () => void, debounceMs?: number) => FeedObserver;
}

/**
 * Owns the capture lifecycle for one feed session: wait for the container, sweep the posts already
 * present, then re-sweep on each debounced mutation. Dedups by post id so each post emits once.
 * Pure DOM/extraction/transport dependencies are injected, so this is fully unit-testable.
 */
export class CaptureController {
  private readonly seen = new DedupStore();
  private observer: FeedObserver | null = null;
  private running = false;

  constructor(private readonly deps: CaptureControllerDeps) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const wait = this.deps.waitForContainer ?? defaultWaitForContainer;
    const container = await wait(this.deps.findContainer);
    if (!this.running) return; // stopped while waiting
    if (!container) {
      logWarn('capture: feed container never appeared');
      return;
    }

    this.sweep(container); // initial pass over already-rendered posts
    const makeObserver = this.deps.createObserver ?? createFeedObserver;
    this.observer = makeObserver(container, () => this.sweep(container), this.deps.debounceMs);
  }

  stop(): void {
    this.running = false;
    this.observer?.disconnect();
    this.observer = null;
    // Deliberately KEEP the dedup set: returning to the feed must not re-emit prior posts.
  }

  /** Visible-for-testing count of posts emitted this session. */
  get capturedCount(): number {
    return this.seen.size;
  }

  private sweep(container: Element): void {
    for (const root of this.deps.findPostRoots(container)) {
      // Cheap pre-skip: virtualized scroll re-surfaces the same nodes constantly, so avoid the
      // expensive full extraction for posts already emitted this session.
      const preId = this.deps.readId?.(root);
      if (preId != null && this.seen.has(preId)) continue;
      try {
        const payload = this.deps.extract(root);
        if (!payload) continue;
        if (!this.seen.add(payload.linkedin_post_id)) continue; // already emitted
        this.deps.emit(payload);
      } catch (error) {
        logWarn('capture: extraction failed for a post node', error);
      }
    }
  }
}

/** Resolve once the container exists, or null after `timeoutMs`. */
async function defaultWaitForContainer(
  findContainer: () => Element | null,
  timeoutMs = 10_000,
  intervalMs = 200,
): Promise<Element | null> {
  const existing = findContainer();
  if (existing) return existing;

  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const found = findContainer();
      if (found || Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        resolve(found);
      }
    }, intervalMs);
  });
}
