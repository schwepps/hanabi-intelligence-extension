/**
 * Session dedup: capture each post at most once per tab. Content scripts persist for the tab's
 * lifetime (unlike the ephemeral service worker), so this in-memory set survives SPA navigation
 * and observer restarts. Keys on the stable post URN, never node identity — so a re-rendered or
 * recycled node for an already-seen post is a no-op. The backend (FSC-98) is the durable dedup.
 */
/** Cap on remembered ids so a days-long session can't grow the set unbounded. */
const DEFAULT_MAX_ENTRIES = 5000;

export class DedupStore {
  private readonly seen = new Set<string>();

  constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  /** Record `id`; returns true if it was new, false if already seen. */
  add(id: string): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    // FIFO eviction (Set preserves insertion order). Evicting an old id only risks a re-send that
    // the backend (the durable dedup) collapses.
    if (this.seen.size > this.maxEntries) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return true;
  }

  has(id: string): boolean {
    return this.seen.has(id);
  }

  get size(): number {
    return this.seen.size;
  }
}
