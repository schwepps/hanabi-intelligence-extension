/**
 * The ingestion wire contract — mirrors the backend's `POST /api/ingest` (FSC-98,
 * `hanabi-radar`). Isolated from `shared/payload.ts` (the extension's INTERNAL capture shape) because
 * the wire shape is the backend's, not ours: the backend validates each post with `z.strictObject`,
 * so ANY key it doesn't know — `comments`, or a future `PostPayload` addition — rejects the whole
 * batch with 422. `toIngestPost` is an explicit allowlist so that can never happen by accident.
 */
import type { PostPayload } from './payload';

/** Backend ingest route (relative to the configured backend origin). */
export const INGEST_PATH = '/api/ingest';

/** Envelope schema version — the backend requires the literal number `1`. */
export const INGEST_VERSION = 1;

/** Max posts per batch (backend `BATCH_MAX`; over 50 or empty → 422). */
export const BATCH_MAX_POSTS = 50;

/** Max serialized request body the backend accepts (`MAX_BODY_BYTES`; over → 413). */
export const MAX_BATCH_BYTES = 512 * 1024;

/**
 * The exact field set the backend `postSchema` accepts. Keep in lockstep with it. `comments` is
 * deliberately EXCLUDED until FSC-114 adds backend support (the extension captures it but must not
 * send it — see `toIngestPost`).
 */
export const INGEST_POST_KEYS = [
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
] as const;

/** One post as sent on the wire — every `PostPayload` field the backend accepts, minus `comments`. */
export type IngestPost = Pick<PostPayload, (typeof INGEST_POST_KEYS)[number]>;

/** The batch request body. */
export interface IngestBatch {
  version: typeof INGEST_VERSION;
  posts: IngestPost[];
}

/** Success body (HTTP 200). Returns counts + the ids the DB isolated — never the accepted ids. */
export interface IngestSuccessBody {
  received: number;
  new_items: number;
  known_items: number;
  failed?: { linkedin_post_id: string; error: string }[];
}

/** Uniform error body for every non-2xx. `issues` is present on a 422 schema rejection. The backend
 * serializes each issue `path` as a dot-joined string, e.g. `"posts.1.author_name"` (NOT an array). */
export interface IngestErrorBody {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
  };
}

/**
 * Project an internal `PostPayload` onto the backend allowlist. Explicit copy (not spread/`delete`)
 * so a new `PostPayload` field is never sent until it's added here AND to the backend schema.
 */
export function toIngestPost(payload: PostPayload): IngestPost {
  const wire: Record<string, unknown> = {};
  for (const key of INGEST_POST_KEYS) {
    wire[key] = payload[key];
  }
  return wire as IngestPost;
}

/** Wrap posts in the versioned batch envelope the backend expects. */
export function buildBatch(posts: PostPayload[]): IngestBatch {
  return { version: INGEST_VERSION, posts: posts.map(toIngestPost) };
}
