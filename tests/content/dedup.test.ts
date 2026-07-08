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
});
