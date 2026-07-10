import type { PostPayload } from '@/shared/payload';

/**
 * Per-tab scan state for the MAIN-world feed reader: which post nodes we're done
 * with, and how many settles a not-yet-capturable node has been retried. Held by
 * the caller so it survives across observer settles within a tab session.
 */
export interface CollectState {
  /** Nodes we're finished with — either captured once, or abandoned after retries. */
  readonly done: WeakSet<Element>;
  /** Retry counter for nodes that have assembled to null so far. */
  readonly attempts: WeakMap<Element, number>;
}

export function createCollectState(): CollectState {
  return {
    done: new WeakSet<Element>(),
    attempts: new WeakMap<Element, number>(),
  };
}

/**
 * A post node that assembles to `null` on a given settle is usually still hydrating
 * — its activity URN (read from React props) or author block isn't in the DOM yet.
 * The infinite-scroll feed can render a node before it is fully hydrated, so marking
 * every node "seen" on first sight turns a *transient* miss into a *permanent* drop.
 * We instead retry a failed node on later settles, and only abandon it after
 * `MAX_ASSEMBLE_ATTEMPTS` so a genuinely un-capturable node is never re-walked forever.
 */
export const MAX_ASSEMBLE_ATTEMPTS = 3;

/**
 * Assemble each candidate post node exactly once per settle, mutating `state`:
 * a node captured (non-null payload) or abandoned (too many failures) is marked
 * `done` and skipped on future settles; a node that failed but still has retries
 * left is left for the next settle. Returns the payloads captured this settle.
 * The isolated content script remains the durable dedup by URN, so a node retried
 * across settles can never double-send.
 */
export function collectPosts(
  nodes: Iterable<Element>,
  assemble: (node: Element) => PostPayload | null,
  state: CollectState,
): PostPayload[] {
  const posts: PostPayload[] = [];
  for (const node of nodes) {
    if (state.done.has(node)) continue;
    const payload = assemble(node);
    if (payload) {
      state.done.add(node);
      posts.push(payload);
      continue;
    }
    const attempts = (state.attempts.get(node) ?? 0) + 1;
    if (attempts >= MAX_ASSEMBLE_ATTEMPTS) {
      state.done.add(node); // give up so this node isn't re-walked on every settle
    } else {
      state.attempts.set(node, attempts);
    }
  }
  return posts;
}
