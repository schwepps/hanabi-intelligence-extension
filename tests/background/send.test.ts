import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitBatch } from '@/entrypoints/background/send';
import type { IngestBatch } from '@/shared/ingestion';
import { stubPayload } from '../support/factories';
import { jsonResponse, stubFetch } from '../support/fetch';

const urn = (n: number | string) => `urn:li:activity:${n}`;
const ok = (extra: Record<string, unknown> = {}) =>
  jsonResponse(200, { received: 1, new_items: 1, known_items: 0, ...extra });
const errorBody = (code: string, issues?: unknown[]) => ({
  error: { code, message: code, issues },
});

describe('submitBatch', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs the versioned envelope with auth + JSON headers, stripping comments', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(ok()));
    const posts = [
      stubPayload({
        linkedin_post_id: urn(1),
        comments: [{ author_name: 'Bob', author_profile_url: null, text: 'hi' }],
      }),
    ];

    const outcome = await submitBatch(posts, 'raw-token-123');

    expect(outcome).toEqual({ kind: 'ok', failed: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/ingest');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer raw-token-123',
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(String(init?.body)) as IngestBatch;
    expect(body.version).toBe(1);
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].linkedin_post_id).toBe(urn(1));
    expect('comments' in body.posts[0]).toBe(false);
  });

  it('reports backend-isolated ids from a 200 failed[] as forgettable', async () => {
    stubFetch(() =>
      Promise.resolve(
        ok({ known_items: 1, failed: [{ linkedin_post_id: urn(9), error: '23505' }] }),
      ),
    );

    const outcome = await submitBatch([stubPayload({ linkedin_post_id: urn(9) })], 'tok');

    expect(outcome).toEqual({ kind: 'ok', failed: [urn(9)] });
  });

  it('halts on 401 (bad/expired token)', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(401, errorBody('unauthorized'))));
    await expect(submitBatch([stubPayload({ linkedin_post_id: urn(1) })], 'tok')).resolves.toEqual({
      kind: 'halt',
    });
  });

  it('halts on 403 (auth-adjacent)', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(403, errorBody('forbidden'))));
    await expect(submitBatch([stubPayload({ linkedin_post_id: urn(1) })], 'tok')).resolves.toEqual({
      kind: 'halt',
    });
  });

  it('signals tooLarge on 413 so the caller re-chunks', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(413, errorBody('payload_too_large'))));
    await expect(submitBatch([stubPayload({ linkedin_post_id: urn(1) })], 'tok')).resolves.toEqual({
      kind: 'tooLarge',
    });
  });

  it('drops only the schema-rejected post on 422 (by the dot-joined issues[].path index)', async () => {
    const posts = [
      stubPayload({ linkedin_post_id: urn(1) }),
      stubPayload({ linkedin_post_id: urn(2) }),
      stubPayload({ linkedin_post_id: urn(3) }),
    ];
    // The backend serializes issue.path as a dot-joined STRING ("posts.<i>.<field>"),
    // not an array — see hanabi-radar route.ts (`issue.path.map(String).join('.')`).
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(
          422,
          errorBody('invalid_payload', [{ path: 'posts.1.posted_at_raw', message: 'too long' }]),
        ),
      ),
    );

    const outcome = await submitBatch(posts, 'tok');

    expect(outcome).toEqual({ kind: 'poison', dropIds: [urn(2)] });
  });

  it('halts on an envelope-level 422 (no post index) instead of looping forever', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(422, errorBody('invalid_payload', [{ path: 'version', message: 'invalid' }])),
      ),
    );

    const outcome = await submitBatch([stubPayload({ linkedin_post_id: urn(1) })], 'tok');

    expect(outcome).toEqual({ kind: 'halt' });
  });

  it('treats 408, 429 and 5xx as transient (retry with backoff)', async () => {
    for (const status of [408, 429, 500, 503]) {
      stubFetch(() => Promise.resolve(jsonResponse(status, errorBody('err'))));
      await expect(
        submitBatch([stubPayload({ linkedin_post_id: urn(1) })], 'tok'),
      ).resolves.toEqual({ kind: 'transient' });
    }
  });

  it('treats a network error as transient, never throwing into the drain', async () => {
    stubFetch(() => Promise.reject(new Error('offline')));
    await expect(submitBatch([stubPayload({ linkedin_post_id: urn(1) })], 'tok')).resolves.toEqual({
      kind: 'transient',
    });
  });

  it('treats a 200 with an unparseable body as an accepted batch (never throws)', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response('<!DOCTYPE html>proxy interstitial', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    await expect(submitBatch([stubPayload({ linkedin_post_id: urn(1) })], 'tok')).resolves.toEqual({
      kind: 'ok',
      failed: [],
    });
  });

  it('forwards an abort signal to fetch and refuses redirects', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(ok()));
    const controller = new AbortController();

    await submitBatch([stubPayload({ linkedin_post_id: urn(1) })], 'tok', controller.signal);

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('error');
  });

  it('never throws on a malformed response shape (non-array failed / issues)', async () => {
    stubFetch(() => Promise.resolve(ok({ failed: { not: 'an array' } })));
    await expect(submitBatch([stubPayload({ linkedin_post_id: urn(1) })], 'tok')).resolves.toEqual({
      kind: 'ok',
      failed: [],
    });

    stubFetch(() =>
      Promise.resolve(jsonResponse(422, { error: { code: 'invalid_payload', issues: 7 } })),
    );
    await expect(submitBatch([stubPayload({ linkedin_post_id: urn(1) })], 'tok')).resolves.toEqual({
      kind: 'halt',
    });
  });

  it('never sends an empty batch (backend rejects it)', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(ok()));
    const outcome = await submitBatch([], 'tok');
    expect(outcome).toEqual({ kind: 'ok', failed: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
