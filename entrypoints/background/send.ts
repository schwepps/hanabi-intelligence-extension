/**
 * One authenticated batch POST to the ingestion backend (`POST /api/ingest`, FSC-98) + classification
 * of the response into a drain action. Mirrors the auth/base-URL idiom of `shared/sensor-api.ts`
 * (`Authorization: Bearer <token>`, `BASE_URL = backendOrigin(import.meta.env.PROD)`), but unlike the
 * onboarding calls it returns a discriminated union instead of throwing: the drain must branch several
 * ways (forget / drop / retry / halt) and a partial 200 must still say which ids to forget — an
 * exception would lose that. Must run from the background worker (`host_permissions`); the backend
 * sets no CORS headers, so a content-script fetch would fail.
 */
import { backendOrigin } from '@/shared/backend';
import {
  buildBatch,
  INGEST_PATH,
  type IngestErrorBody,
  type IngestSuccessBody,
} from '@/shared/ingestion';
import type { PostPayload } from '@/shared/payload';

const BASE_URL = backendOrigin(import.meta.env.PROD);

export type SubmitOutcome =
  | { kind: 'ok'; failed: string[] } // 200 — forget the whole batch; `failed` were isolated backend-side
  | { kind: 'poison'; dropIds: string[] } // 422 — drop the schema-rejected posts, retry the rest
  | { kind: 'tooLarge' } // 413 — caller must re-chunk into a smaller batch
  | { kind: 'halt' } // 401/403/415/400/… — stop the drain, keep the data (request/auth problem)
  | { kind: 'transient' }; // 429 / 5xx / network — retryable with backoff

/**
 * Submit a batch of posts. Never throws; a network failure OR an aborted request maps to `transient`.
 * `signal` lets the caller abort an in-flight send (used to stop transmission on consent opt-out).
 */
export async function submitBatch(
  posts: PostPayload[],
  token: string,
  signal?: AbortSignal,
): Promise<SubmitOutcome> {
  if (posts.length === 0) return { kind: 'ok', failed: [] };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${INGEST_PATH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBatch(posts)),
      signal,
    });
  } catch {
    return { kind: 'transient' };
  }

  if (res.ok) {
    // A 200 means the batch was accepted; guard the parse so a proxy/CDN interstitial served as 200
    // (non-JSON body) doesn't throw out of this "never throws" function — treat it as "no failures".
    const body = (await res.json().catch(() => null)) as IngestSuccessBody | null;
    return { kind: 'ok', failed: (body?.failed ?? []).map((f) => f.linkedin_post_id) };
  }
  if (res.status === 413) return { kind: 'tooLarge' };
  if (res.status === 422) return classifyPoison(res, posts);
  if (res.status === 429 || res.status >= 500) return { kind: 'transient' };
  // Everything else non-2xx (401/403/404/415/400/…) is an auth/request/deploy problem: retrying the
  // same request won't help, so halt and keep the data rather than spin or drop it.
  return { kind: 'halt' };
}

/**
 * A 422 rejects the whole batch on the first schema violation. Map each `issues[].path` (`['posts',
 * <index>, <field>]`) back to a `linkedin_post_id` and drop exactly those. If no post index is present
 * (an envelope-level error, e.g. a bad `version`), our request itself is malformed — halt rather than
 * drop good data or loop forever on an unchanged batch.
 */
async function classifyPoison(res: Response, posts: PostPayload[]): Promise<SubmitOutcome> {
  const body = (await res.json().catch(() => null)) as IngestErrorBody | null;
  const dropIds = new Set<string>();
  for (const issue of body?.error?.issues ?? []) {
    const index = issue.path?.[1];
    if (typeof index === 'number' && posts[index]) dropIds.add(posts[index].linkedin_post_id);
  }
  return dropIds.size === 0 ? { kind: 'halt' } : { kind: 'poison', dropIds: [...dropIds] };
}
