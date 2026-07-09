// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_SOURCE,
  isValidCapturedPost,
  postCapture,
  postControl,
  postHello,
  readBridgeMessage,
} from '@/shared/window-bridge';
import { stubPayload } from '../support/factories';

const event = (
  data: unknown,
  origin: string = window.location.origin,
  source: unknown = window,
): MessageEvent => ({ data, origin, source }) as unknown as MessageEvent;

describe('readBridgeMessage', () => {
  it('accepts a same-window, same-origin, tagged message', () => {
    const msg = { source: BRIDGE_SOURCE, kind: 'control', enabled: true };
    expect(readBridgeMessage(event(msg))).toMatchObject({ kind: 'control', enabled: true });
  });

  it('rejects a foreign origin', () => {
    const msg = { source: BRIDGE_SOURCE, kind: 'hello' };
    expect(readBridgeMessage(event(msg, 'https://evil.example.com'))).toBeNull();
  });

  it('rejects a foreign window source', () => {
    const msg = { source: BRIDGE_SOURCE, kind: 'hello' };
    expect(readBridgeMessage(event(msg, window.location.origin, {}))).toBeNull();
  });

  it('rejects untagged data', () => {
    expect(readBridgeMessage(event({ source: 'someone-else', kind: 'control' }))).toBeNull();
    expect(readBridgeMessage(event(null))).toBeNull();
  });
});

describe('post helpers', () => {
  it('post the correctly-tagged messages', () => {
    const spy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    postHello();
    postControl(true);
    postCapture([stubPayload({ linkedin_post_id: 'urn:li:activity:1' })]);
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ source: BRIDGE_SOURCE, kind: 'hello' });
    expect(spy.mock.calls[1]?.[0]).toMatchObject({
      source: BRIDGE_SOURCE,
      kind: 'control',
      enabled: true,
    });
    expect(spy.mock.calls[2]?.[0]).toMatchObject({ source: BRIDGE_SOURCE, kind: 'capture' });
    spy.mockRestore();
  });
});

describe('readBridgeMessage field validation', () => {
  it('rejects control without a boolean enabled and capture without an array posts', () => {
    expect(
      readBridgeMessage(event({ source: BRIDGE_SOURCE, kind: 'control', enabled: 'yes' })),
    ).toBeNull();
    expect(
      readBridgeMessage(event({ source: BRIDGE_SOURCE, kind: 'capture', posts: 'oops' })),
    ).toBeNull();
    expect(readBridgeMessage(event({ source: BRIDGE_SOURCE, kind: 'bogus' }))).toBeNull();
  });
  it('accepts well-formed control and capture', () => {
    expect(
      readBridgeMessage(event({ source: BRIDGE_SOURCE, kind: 'capture', posts: [] })),
    ).toMatchObject({
      kind: 'capture',
    });
  });
});

describe('isValidCapturedPost', () => {
  it('accepts a well-formed post', () => {
    expect(isValidCapturedPost(stubPayload({ linkedin_post_id: 'urn:li:activity:123' }))).toBe(
      true,
    );
    expect(
      isValidCapturedPost(
        stubPayload({
          linkedin_post_id: 'urn:li:ugcPost:9',
          author_profile_url: 'https://www.linkedin.com/in/ada/',
        }),
      ),
    ).toBe(true);
  });

  it('accepts populated enum + best-effort string fields (FSC-116/117/118)', () => {
    expect(
      isValidCapturedPost(
        stubPayload({
          linkedin_post_id: 'urn:li:activity:7',
          author_type: 'company',
          post_type: 'document',
          author_degree: 'second',
          author_company: 'Globex',
          author_title: 'Founder',
          media_title: 'n8n et Claude',
          posted_at_raw: '16 h',
        }),
      ),
    ).toBe(true);
  });

  it('rejects an out-of-enum author_type / post_type / author_degree', () => {
    const base = stubPayload({ linkedin_post_id: 'urn:li:activity:1' });
    expect(isValidCapturedPost({ ...base, author_type: 'robot' } as unknown)).toBe(false);
    expect(isValidCapturedPost({ ...base, post_type: 'gif' } as unknown)).toBe(false);
    expect(isValidCapturedPost({ ...base, author_degree: 'fourth' } as unknown)).toBe(false);
  });

  it('rejects a non-string best-effort field (would 422 the batch)', () => {
    const base = stubPayload({ linkedin_post_id: 'urn:li:activity:1' });
    expect(isValidCapturedPost({ ...base, author_company: 123 } as unknown)).toBe(false);
    expect(isValidCapturedPost({ ...base, author_title: [] } as unknown)).toBe(false);
    expect(isValidCapturedPost({ ...base, media_title: 5 } as unknown)).toBe(false);
    expect(isValidCapturedPost({ ...base, posted_at_raw: {} } as unknown)).toBe(false);
  });

  it('accepts a repost that names its original author', () => {
    expect(
      isValidCapturedPost(
        stubPayload({
          linkedin_post_id: 'urn:li:activity:5',
          is_repost: true,
          original_author_name: 'Grace Hopper',
          original_author_profile_url: 'https://www.linkedin.com/in/grace/',
        }),
      ),
    ).toBe(true);
  });

  it('rejects a forged/malformed post', () => {
    // bad URN shape (would poison the dedup key)
    expect(isValidCapturedPost(stubPayload({ linkedin_post_id: 'not-a-urn' }))).toBe(false);
    // off-LinkedIn url / profile url
    expect(
      isValidCapturedPost(
        stubPayload({ linkedin_post_id: 'urn:li:activity:1', url: 'https://evil.example.com/x' }),
      ),
    ).toBe(false);
    expect(
      isValidCapturedPost(
        stubPayload({
          linkedin_post_id: 'urn:li:activity:1',
          author_profile_url: 'https://evil.example.com/in/x',
        }),
      ),
    ).toBe(false);
    // lookalike host is rejected (endsWith bug)
    expect(
      isValidCapturedPost(
        stubPayload({
          linkedin_post_id: 'urn:li:activity:1',
          url: 'https://evillinkedin.com/feed/update/x',
        }),
      ),
    ).toBe(false);
    // numeric sanity: negative / non-integer counts
    expect(
      isValidCapturedPost(
        stubPayload({ linkedin_post_id: 'urn:li:activity:1', reaction_count: -5 }),
      ),
    ).toBe(false);
    expect(
      isValidCapturedPost(
        stubPayload({ linkedin_post_id: 'urn:li:activity:1', comment_count: 1.5 }),
      ),
    ).toBe(false);
    // element types: non-string hashtag, comment with off-host profile url
    expect(
      isValidCapturedPost({
        ...stubPayload({ linkedin_post_id: 'urn:li:activity:1' }),
        hashtags: [1, 2],
      } as unknown),
    ).toBe(false);
    expect(
      isValidCapturedPost(
        stubPayload({
          linkedin_post_id: 'urn:li:activity:1',
          comments: [
            { author_name: 'x', author_profile_url: 'https://evil.example.com/in/y', text: 'hi' },
          ],
        }),
      ),
    ).toBe(false);
    // wrong container types / non-objects
    expect(
      isValidCapturedPost({
        ...stubPayload({ linkedin_post_id: 'urn:li:activity:1' }),
        comments: 'nope',
      }),
    ).toBe(false);
    expect(isValidCapturedPost(null)).toBe(false);
    expect(isValidCapturedPost('string')).toBe(false);
  });

  it('rejects a repost with no original author (backend refine invariant)', () => {
    // is_repost with the default null original_author_name — the exact shape the backend 422s
    expect(
      isValidCapturedPost(stubPayload({ linkedin_post_id: 'urn:li:activity:1', is_repost: true })),
    ).toBe(false);
    // a forged truthy-but-not-boolean is_repost must not bypass the provenance guard (type confusion)
    expect(
      isValidCapturedPost({
        ...stubPayload({ linkedin_post_id: 'urn:li:activity:1' }),
        is_repost: 1,
      } as unknown),
    ).toBe(false);
    // whitespace-only original author name is not a real author
    expect(
      isValidCapturedPost(
        stubPayload({
          linkedin_post_id: 'urn:li:activity:1',
          is_repost: true,
          original_author_name: '   ',
        }),
      ),
    ).toBe(false);
    // off-LinkedIn original author profile url
    expect(
      isValidCapturedPost(
        stubPayload({
          linkedin_post_id: 'urn:li:activity:1',
          is_repost: true,
          original_author_name: 'Grace Hopper',
          original_author_profile_url: 'https://evil.example.com/in/grace',
        }),
      ),
    ).toBe(false);
    // a forged non-string original_author_name must be rejected even when is_repost is false
    // (the guard claims `value is PostPayload`; a non-string would 422 the backend batch)
    expect(
      isValidCapturedPost({
        ...stubPayload({ linkedin_post_id: 'urn:li:activity:1', is_repost: false }),
        original_author_name: {},
      } as unknown),
    ).toBe(false);
  });
});
