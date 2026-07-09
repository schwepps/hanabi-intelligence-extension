// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { assemblePost } from '@/entrypoints/content/feed/assemble';
import { fragment } from '../support/dom';

const PAYLOAD_KEYS = [
  'linkedin_post_id',
  'text',
  'url',
  'author_name',
  'author_company',
  'author_title',
  'author_profile_url',
  'author_type',
  'post_type',
  'is_repost',
  'original_author_name',
  'original_author_profile_url',
  'media_title',
  'hashtags',
  'reaction_count',
  'comment_count',
  'posted_at_raw',
  'captured_at',
  'author_degree',
  'social_proof',
  'comments',
].sort();

const post = () =>
  fragment(`
    <div>
      <a href="https://www.linkedin.com/in/ada/" aria-label="Ada"><img alt="" /></a>
      <a href="https://www.linkedin.com/in/ada/"><span>Ada Lovelace</span></a>
      <div data-testid="expandable-text-box">We are hiring</div>
      <span>42 reactions</span>
      <a>7 comments</a>
    </div>`);

const ctx = { now: () => '2026-07-08T12:00:00.000Z' };

describe('assemblePost', () => {
  it('builds a complete payload from node + urn (production-core fields populated)', () => {
    const payload = assemblePost(post(), 'urn:li:activity:9', ctx);
    expect(payload).not.toBeNull();
    expect(Object.keys(payload ?? {}).sort()).toEqual(PAYLOAD_KEYS);
    expect(payload).toMatchObject({
      linkedin_post_id: 'urn:li:activity:9',
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:9/',
      captured_at: '2026-07-08T12:00:00.000Z',
      author_name: 'Ada Lovelace',
      author_profile_url: 'https://www.linkedin.com/in/ada/',
      author_type: 'person',
      text: 'We are hiring',
      reaction_count: 42,
      comment_count: 7,
      post_type: 'text',
    });
  });

  it('skips a node with no urn (no dedup key)', () => {
    expect(assemblePost(post(), null, ctx)).toBeNull();
  });

  it('defaults the deferred/best-effort fields', () => {
    const payload = assemblePost(post(), 'urn:li:activity:9', ctx);
    expect(payload).toMatchObject({
      author_company: null,
      author_title: null,
      is_repost: false,
      original_author_name: null,
      media_title: null,
      posted_at_raw: null,
      author_degree: 'none',
      social_proof: null,
    });
  });
});
