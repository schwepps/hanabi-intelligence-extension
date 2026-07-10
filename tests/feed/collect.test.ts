// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ASSEMBLE_ATTEMPTS,
  collectPosts,
  createCollectState,
} from '@/entrypoints/content/feed/collect';
import type { PostPayload } from '@/shared/payload';
import { stubPayload } from '../support/factories';

const node = (): Element => document.createElement('div');

describe('collectPosts', () => {
  it('captures a node once and does not re-walk it on later settles', () => {
    const n = node();
    const assemble = vi.fn((): PostPayload | null =>
      stubPayload({ linkedin_post_id: 'urn:li:activity:1' }),
    );
    const state = createCollectState();

    const first = collectPosts([n], assemble, state);
    expect(first.map((p) => p.linkedin_post_id)).toEqual(['urn:li:activity:1']);

    // Already done: not returned again and not re-assembled (no wasted React walk).
    expect(collectPosts([n], assemble, state)).toEqual([]);
    expect(assemble).toHaveBeenCalledTimes(1);
  });

  it('retries a node that was still hydrating on first sight (no permanent drop)', () => {
    const n = node();
    const assemble = vi.fn((): PostPayload | null =>
      stubPayload({ linkedin_post_id: 'urn:li:activity:2' }),
    );
    // First settle: the node is not yet hydrated (URN/author absent) → null.
    assemble.mockReturnValueOnce(null);
    const state = createCollectState();

    expect(collectPosts([n], assemble, state)).toEqual([]); // missed while hydrating
    expect(collectPosts([n], assemble, state).map((p) => p.linkedin_post_id)).toEqual(
      ['urn:li:activity:2'], // captured on retry instead of dropped forever
    );
    expect(assemble).toHaveBeenCalledTimes(2);
  });

  it('abandons a node that never assembles after MAX_ASSEMBLE_ATTEMPTS', () => {
    const n = node();
    const assemble = vi.fn((): PostPayload | null => null);
    const state = createCollectState();

    for (let settle = 0; settle < MAX_ASSEMBLE_ATTEMPTS + 5; settle++) {
      expect(collectPosts([n], assemble, state)).toEqual([]);
    }
    // Stops re-walking once the retry budget is exhausted, so it can't spin forever.
    expect(assemble).toHaveBeenCalledTimes(MAX_ASSEMBLE_ATTEMPTS);
  });

  it('returns only the payloads newly captured on each settle', () => {
    const a = node();
    const b = node();
    const payloads = new Map<Element, PostPayload | null>([
      [a, stubPayload({ linkedin_post_id: 'urn:li:activity:a' })],
      [b, null],
    ]);
    const assemble = vi.fn((n: Element): PostPayload | null => payloads.get(n) ?? null);
    const state = createCollectState();

    expect(collectPosts([a, b], assemble, state).map((p) => p.linkedin_post_id)).toEqual([
      'urn:li:activity:a',
    ]);

    // b hydrates before the next settle; a is already done and not re-assembled.
    payloads.set(b, stubPayload({ linkedin_post_id: 'urn:li:activity:b' }));
    expect(collectPosts([a, b], assemble, state).map((p) => p.linkedin_post_id)).toEqual([
      'urn:li:activity:b',
    ]);
  });
});
