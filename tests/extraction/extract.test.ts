// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { extractIdentity } from '@/entrypoints/content/extract/identity';
import { assemblePost } from '@/entrypoints/content/extract';
import { findPostRoots } from '@/entrypoints/content/selectors';
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
].sort();

describe('extractIdentity', () => {
  it('reads the activity URN from data-urn and derives the permalink', () => {
    const root = fragment('<div data-urn="urn:li:activity:7123456789"></div>');
    expect(extractIdentity(root)).toEqual({
      linkedin_post_id: 'urn:li:activity:7123456789',
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:7123456789/',
    });
  });

  it('falls back to data-id and tolerates trailing content', () => {
    expect(
      extractIdentity(fragment('<div data-id="urn:li:activity:42"></div>'))?.linkedin_post_id,
    ).toBe('urn:li:activity:42');
    expect(
      extractIdentity(fragment('<div data-urn="urn:li:activity:99 extra"></div>'))
        ?.linkedin_post_id,
    ).toBe('urn:li:activity:99');
  });

  it('returns null when no URN is present', () => {
    expect(extractIdentity(fragment('<div class="post"></div>'))).toBeNull();
  });
});

describe('assemblePost', () => {
  it('builds a complete payload: identity from the URN, defaults elsewhere, injected captured_at', () => {
    const payload = assemblePost(fragment('<div data-urn="urn:li:activity:7">body</div>'), {
      now: () => '2026-07-08T12:00:00.000Z',
    });

    expect(payload).not.toBeNull();
    expect(Object.keys(payload ?? {}).sort()).toEqual(PAYLOAD_KEYS); // full contract shape
    expect(payload).toMatchObject({
      linkedin_post_id: 'urn:li:activity:7',
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:7/',
      captured_at: '2026-07-08T12:00:00.000Z',
      author_type: 'person',
      post_type: 'text',
      is_repost: false,
      hashtags: [],
      reaction_count: 0,
      comment_count: 0,
      author_degree: 'none',
      text: null,
      social_proof: null,
    });
  });

  it('skips a post with no resolvable URN (missing dedup key)', () => {
    expect(assemblePost(fragment('<div></div>'), { now: () => 'x' })).toBeNull();
  });
});

describe('findPostRoots', () => {
  it('returns top-level posts and excludes a nested repost inner update', () => {
    const container = fragment(`
      <div id="feed">
        <div data-urn="urn:li:activity:1"></div>
        <div data-urn="urn:li:activity:2">
          <div data-urn="urn:li:activity:99"></div>
        </div>
      </div>
    `);

    const urns = findPostRoots(container)
      .map((el) => el.getAttribute('data-urn'))
      .sort();
    expect(urns).toEqual(['urn:li:activity:1', 'urn:li:activity:2']);
  });
});
