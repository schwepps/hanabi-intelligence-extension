import { describe, expect, it } from 'vitest';
import { DedupStore } from '@/entrypoints/content/dedup';

describe('DedupStore', () => {
  it('reports an id as new only the first time', () => {
    const store = new DedupStore();
    expect(store.add('urn:li:activity:1')).toBe(true);
    expect(store.add('urn:li:activity:1')).toBe(false);
    expect(store.has('urn:li:activity:1')).toBe(true);
  });

  it('tracks distinct ids independently', () => {
    const store = new DedupStore();
    store.add('a');
    store.add('b');
    expect(store.size).toBe(2);
    expect(store.has('c')).toBe(false);
  });

  it('evicts the oldest id past the cap (bounded memory)', () => {
    const store = new DedupStore(2);
    store.add('a');
    store.add('b');
    store.add('c'); // over cap → evicts oldest ('a')
    expect(store.size).toBe(2);
    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(true);
    expect(store.has('c')).toBe(true);
    expect(store.add('a')).toBe(true); // evicted, so treated as new again
  });
});
