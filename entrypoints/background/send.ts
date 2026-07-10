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
  | { kind: 'halt' } // 401/403/404/415/400/… — stop the drain, keep the data (auth/request problem)
  | { kind: 'transient' }; // 408 / 429 / 5xx / network — retryable with backoff

/**
 * Submit a batch of posts. Never throws — a network failure, an aborted request, or an unexpected
 * response shape all map to an outcome. `signal` lets the caller abort an in-flight send (used to stop
 * transmission on consent opt-out).
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
      // Never re-POST the batch body (post text + author PII) to a redirect target; a 3xx from the
      // origin becomes a network error → transient retry against the exact configured origin only.
      redirect: 'error',
    });
  } catch {
    return { kind: 'transient' };
  }

  if (res.ok) {
    // A 200 means the batch was accepted; guard both the parse and the shape so a proxy/CDN
    // interstitial served as 200, or a `failed` that isn't an array, can't throw out of this function.
    const body = (await res.json().catch(() => null)) as IngestSuccessBody | null;
    const failed = Array.isArray(body?.failed) ? body.failed : [];
    return { kind: 'ok', failed: failed.map((f) => f.linkedin_post_id) };
  }
  if (res.status === 413) return { kind: 'tooLarge' };
  if (res.status === 422) return classifyPoison(res, posts);
  if (res.status === 408 || res.status === 429 || res.status >= 500) return { kind: 'transient' };
  // Everything else non-2xx (401/403/404/415/400/…) is an auth/request/deploy problem: retrying the
  // same request won't help, so halt and keep the data rather than spin or drop it.
  return { kind: 'halt' };
}

/**
 * A 422 rejects the whole batch on the first schema violation. Map each `issues[].path` back to a
 * `linkedin_post_id` and drop exactly those. If no post index is present (an envelope-level error,
 * e.g. a bad `version`), our request itself is malformed — halt rather than drop good data or loop
 * forever on an unchanged batch.
 */
async function classifyPoison(res: Response, posts: PostPayload[]): Promise<SubmitOutcome> {
  const body = (await res.json().catch(() => null)) as IngestErrorBody | null;
  const issues = Array.isArray(body?.error?.issues) ? body.error.issues : [];
  const dropIds = new Set<string>();
  for (const issue of issues) {
    const index = postIndexFromPath(issue.path);
    if (index !== null && posts[index]) dropIds.add(posts[index].linkedin_post_id);
  }
  return dropIds.size === 0 ? { kind: 'halt' } : { kind: 'poison', dropIds: [...dropIds] };
}

// A post-level issue path is "posts.<index>.<field>" (dot-joined by the backend). Anchor on the
// `posts.` prefix and capture the digit run so only a real post index matches — never an
// envelope-level path ("version"), a non-post path ("comments.1.text"), or a malformed one
// ("posts..field", where a bare Number('') would otherwise coerce to 0 and drop post 0).
const POST_PATH_INDEX_RE = /^posts\.(\d+)(?:\.|$)/;

/**
 * Extract the batch post index from an issue path. The backend serializes `issue.path` as a
 * dot-joined STRING — `"posts.<index>.<field>"` (hanabi-radar `route.ts`: `path.map(String).join('.')`);
 * anything without a `posts.<digits>` prefix (an envelope error, a non-post path, a malformed one, or a
 * non-string proxy body) yields null, so the caller halts rather than dropping a good post.
 */
function postIndexFromPath(path: unknown): number | null {
  if (typeof path !== 'string') return null;
  const match = POST_PATH_INDEX_RE.exec(path);
  return match ? Number(match[1]) : null;
}
