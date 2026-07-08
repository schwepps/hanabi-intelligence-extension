/**
 * Read a post's activity URN from its React props/fiber. LinkedIn's SDUI feed does not put the URN
 * in any DOM attribute, but the browser keeps it on the node's React internals (`__reactProps$…` /
 * `__reactFiber$…`) inside tracking/action props — validated reachable for 100% of posts in recon.
 *
 * ⚠️ MAIN-world only: React internals are page-context JS properties, invisible to an isolated
 * content script. This runs inside the injected `world:'MAIN'` reader.
 *
 * Takes the first `urn:li:(activity|ugcPost):<n>` found (skipping sponsored refs). For a quote
 * repost the outer feed-item URN and the original's URN can both be present; disambiguating the
 * outer one is a known follow-up.
 */
const POST_URN_RE = /urn:li:(?:activity|ugcPost):\d+/;
const MAX_NODES = 20_000;

export function extractActivityUrn(el: Element): string | null {
  const seen = new WeakSet<object>();
  let count = 0;
  let result: string | null = null;

  const walk = (obj: unknown, depth: number): void => {
    if (result !== null || obj === null || typeof obj !== 'object' || depth > 9) return;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (++count > MAX_NODES) return;
    for (const key in obj as Record<string, unknown>) {
      let value: unknown;
      try {
        value = (obj as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      if (typeof value === 'string') {
        const match = value.match(POST_URN_RE);
        if (match && !/sponsored/i.test(value)) {
          result = match[0];
          return;
        }
      } else if (value !== null && typeof value === 'object') {
        walk(value, depth + 1);
      }
    }
  };

  for (const key of Object.keys(el)) {
    if (key.startsWith('__react')) {
      walk((el as unknown as Record<string, unknown>)[key], 0);
      if (result !== null) break;
    }
  }
  return result;
}
