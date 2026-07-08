import type { PostPayload } from '@/shared/payload';

/** A fully-typed PostPayload with contract defaults; override any field for the case under test. */
export function stubPayload(
  overrides: Partial<PostPayload> & { linkedin_post_id: string },
): PostPayload {
  return {
    text: null,
    url: `https://www.linkedin.com/feed/update/${overrides.linkedin_post_id}/`,
    author_name: null,
    author_company: null,
    author_title: null,
    author_profile_url: null,
    author_type: 'person',
    post_type: 'text',
    is_repost: false,
    original_author_name: null,
    original_author_profile_url: null,
    media_title: null,
    hashtags: [],
    reaction_count: 0,
    comment_count: 0,
    posted_at_raw: null,
    captured_at: '2026-01-01T00:00:00.000Z',
    author_degree: 'none',
    social_proof: null,
    ...overrides,
  };
}
