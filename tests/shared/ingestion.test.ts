import { describe, expect, it } from 'vitest';
import {
  BATCH_MAX_POSTS,
  buildBatch,
  INGEST_PATH,
  INGEST_POST_KEYS,
  INGEST_VERSION,
  toIngestPost,
} from '@/shared/ingestion';
import type { PostPayload } from '@/shared/payload';
import { stubPayload } from '../support/factories';

describe('toIngestPost', () => {
  it('drops comments and carries every other field through verbatim', () => {
    const payload = stubPayload({
      linkedin_post_id: 'urn:li:activity:1',
      text: 'hello',
      author_name: 'Alice',
      hashtags: ['ai', 'hiring'],
      comments: [{ author_name: 'Bob', author_profile_url: null, text: 'nice' }],
    });

    const wire = toIngestPost(payload);

    expect('comments' in wire).toBe(false);
    expect(wire.linkedin_post_id).toBe('urn:li:activity:1');
    expect(wire.text).toBe('hello');
    expect(wire.author_name).toBe('Alice');
    expect(wire.hashtags).toEqual(['ai', 'hiring']);
    expect(wire.captured_at).toBe(payload.captured_at);
  });

  it('emits exactly the backend allowlist — an unknown key never leaks to the wire', () => {
    const payload = stubPayload({ linkedin_post_id: 'urn:li:activity:2' });
    (payload as unknown as Record<string, unknown>).rogue = 'must-not-be-sent';

    const wire = toIngestPost(payload);

    expect(Object.keys(wire).sort()).toEqual([...INGEST_POST_KEYS].sort());
    expect('rogue' in wire).toBe(false);
  });
});

describe('buildBatch', () => {
  it('wraps posts in the versioned envelope (version is the literal 1)', () => {
    const batch = buildBatch([stubPayload({ linkedin_post_id: 'urn:li:activity:3' })]);

    expect(INGEST_VERSION).toBe(1);
    expect(batch.version).toBe(1);
    expect(batch.posts).toHaveLength(1);
    expect('comments' in batch.posts[0]).toBe(false);
  });
});

describe('constants', () => {
  it('targets the real backend ingest route and batch cap', () => {
    expect(INGEST_PATH).toBe('/api/ingest');
    expect(BATCH_MAX_POSTS).toBe(50);
  });
});

// Type-level guard: IngestPost must not expose a `comments` field.
const _noComments: 'comments' extends keyof ReturnType<typeof toIngestPost> ? never : true = true;
void _noComments;
void ({} as PostPayload);
