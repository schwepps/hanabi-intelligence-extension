import { fakeBrowser } from 'wxt/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consentGranted } from '@/shared/consent';
import { sensorIdentity } from '@/shared/identity';
import { drain, enqueueAndDrain, handleConsentChange } from '@/entrypoints/background/drain';
import { enqueue, sendQueue } from '@/entrypoints/background/queue';
import { hasSent } from '@/entrypoints/background/sent-ids';
import { sendRetry } from '@/entrypoints/background/backoff';
import { stubPayload } from '../support/factories';
import { jsonResponse, stubFetchSequence } from '../support/fetch';

const urn = (n: number | string) => `urn:li:activity:${n}`;
const ok200 = () => jsonResponse(200, { received: 1, new_items: 1, known_items: 0 });

async function link(): Promise<void> {
  await sensorIdentity.setValue({ token: 'tok', id: 's1', name: 'n', email: 'e', linkedAt: 0 });
  await consentGranted.setValue(true);
}

const ids = async () => (await sendQueue.getValue()).map((e) => e.id);

describe('drain', () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does nothing when the sensor is not linked (no token)', async () => {
    const fetchMock = stubFetchSequence(ok200);
    await consentGranted.setValue(true);
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    await drain();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await ids()).toEqual([urn(1)]); // queue intact
  });

  it('does not send while consent is revoked (gate + defense in depth)', async () => {
    const fetchMock = stubFetchSequence(ok200);
    await sensorIdentity.setValue({ token: 'tok', id: 's1', name: 'n', email: 'e', linkedAt: 0 });
    await consentGranted.setValue(false);
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    await drain();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await ids()).toEqual([urn(1)]);
  });

  it('delivers a queued post on 200: removed from queue, marked sent, no retry alarm', async () => {
    const create = vi.spyOn(browser.alarms, 'create');
    const fetchMock = stubFetchSequence(ok200);
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    await drain();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await sendQueue.getValue()).toEqual([]);
    expect(await hasSent(urn(1))).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect((await sendRetry.getValue()).failureStreak).toBe(0);
  });

  it('keeps the queue and schedules a retry on a transient failure', async () => {
    const create = vi.spyOn(browser.alarms, 'create');
    stubFetchSequence(() =>
      Promise.resolve(jsonResponse(500, { error: { code: 'ingest_failed' } })),
    );
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    await drain();

    expect(await ids()).toEqual([urn(1)]); // not lost
    expect(create).toHaveBeenCalledTimes(1);
    expect((await sendRetry.getValue()).failureStreak).toBe(1);
  });

  it('recovers across drains: transient then success delivers the post', async () => {
    stubFetchSequence(
      () => Promise.resolve(jsonResponse(503, { error: { code: 'server_error' } })),
      ok200,
    );
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    await drain(); // fails, keeps the entry
    await drain(); // simulates the retry alarm firing

    expect(await sendQueue.getValue()).toEqual([]);
    expect(await hasSent(urn(1))).toBe(true);
    expect((await sendRetry.getValue()).failureStreak).toBe(0);
  });

  it('halts on 401 without losing data or marking it sent', async () => {
    const create = vi.spyOn(browser.alarms, 'create');
    stubFetchSequence(() =>
      Promise.resolve(jsonResponse(401, { error: { code: 'unauthorized' } })),
    );
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    await drain();

    expect(await ids()).toEqual([urn(1)]);
    expect(await hasSent(urn(1))).toBe(false);
    expect(create).not.toHaveBeenCalled(); // halt does not spin a timed retry
  });

  it('drops only the schema-rejected post on 422 and delivers the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetchSequence(
      () =>
        Promise.resolve(
          jsonResponse(422, {
            error: {
              code: 'invalid_payload',
              // Backend serializes issue.path as a dot-joined string ("posts.<i>.<field>").
              issues: [{ path: 'posts.1.posted_at_raw', message: 'too long' }],
            },
          }),
        ),
      ok200, // retry of the surviving posts
    );
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));
    await enqueue(stubPayload({ linkedin_post_id: urn(2) })); // the poison one
    await enqueue(stubPayload({ linkedin_post_id: urn(3) }));

    await drain();

    expect(await sendQueue.getValue()).toEqual([]);
    expect(await hasSent(urn(1))).toBe(true);
    expect(await hasSent(urn(3))).toBe(true);
    expect(await hasSent(urn(2))).toBe(false); // dropped, never marked sent
    expect(warn).toHaveBeenCalled();
  });

  it('coalesces concurrent drains and still sends a post enqueued mid-flight (re-entrancy guard)', async () => {
    let release!: (r: Response) => void;
    const gate = new Promise<Response>((r) => (release = r));
    let markFirstCall!: () => void;
    const firstInFlight = new Promise<void>((r) => (markFirstCall = r));
    let isFirst = true;
    const fetchMock = vi.fn(() => {
      if (isFirst) {
        isFirst = false;
        markFirstCall();
        return gate; // hold the first send open
      }
      return Promise.resolve(ok200());
    });
    vi.stubGlobal('fetch', fetchMock);
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    const running = drain();
    await firstInFlight; // the first POST is genuinely open
    await enqueueAndDrain(stubPayload({ linkedin_post_id: urn(2) })); // arrives mid-flight → coalesced
    release(ok200());
    await running;
    await new Promise((r) => setTimeout(r, 0)); // let the coalesced rerun settle

    expect(await hasSent(urn(1))).toBe(true);
    expect(await hasSent(urn(2))).toBe(true); // the mid-flight post is delivered, not lost
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not commit or retry a batch when consent is revoked while the POST is in flight', async () => {
    const create = vi.spyOn(browser.alarms, 'create');
    let release!: (r: Response) => void;
    const gate = new Promise<Response>((r) => (release = r));
    let markFetchCalled!: () => void;
    const fetchInFlight = new Promise<void>((r) => (markFetchCalled = r));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        markFetchCalled();
        return gate;
      }),
    );
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    const running = drain();
    await fetchInFlight; // the POST is genuinely dispatched now
    await consentGranted.setValue(false); // opt out mid-flight
    await handleConsentChange(false);
    release(ok200()); // the server still answers 200
    await running;

    expect(await hasSent(urn(1))).toBe(false); // the in-flight result is NOT committed
    expect(create).not.toHaveBeenCalled(); // and no retry is scheduled
    expect(await sendQueue.getValue()).toEqual([]); // queue cleared by the opt-out
  });

  it('enqueueAndDrain sends a fresh post and skips an already-sent duplicate', async () => {
    const fetchMock = stubFetchSequence(ok200);
    await link();

    await enqueueAndDrain(stubPayload({ linkedin_post_id: urn(1) }));
    expect(await hasSent(urn(1))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await enqueueAndDrain(stubPayload({ linkedin_post_id: urn(1) })); // duplicate
    expect(fetchMock).toHaveBeenCalledTimes(1); // no second send
  });

  it('handleConsentChange clears the pending queue AND the retry alarm on revoke, keeps them otherwise', async () => {
    const clear = vi.spyOn(browser.alarms, 'clear');
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    await handleConsentChange(true);
    expect(await ids()).toEqual([urn(1)]);
    expect(clear).not.toHaveBeenCalled();

    await handleConsentChange(false);
    expect(await sendQueue.getValue()).toEqual([]);
    expect(clear).toHaveBeenCalled(); // no pending retry should survive opt-out
  });

  it('splits a backlog larger than the batch cap into sequential sends', async () => {
    const fetchMock = stubFetchSequence(ok200);
    await link();
    for (let i = 0; i < 51; i++) await enqueue(stubPayload({ linkedin_post_id: urn(i) }));

    await drain();

    expect(fetchMock).toHaveBeenCalledTimes(2); // 50 + 1
    expect(await sendQueue.getValue()).toEqual([]);
    expect(await hasSent(urn(0))).toBe(true);
    expect(await hasSent(urn(50))).toBe(true);
  });

  it('retries with a halved ceiling after a 413, then delivers the batch', async () => {
    const fetchMock = stubFetchSequence(
      () => jsonResponse(413, { error: { code: 'payload_too_large' } }),
      ok200,
    );
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));
    await enqueue(stubPayload({ linkedin_post_id: urn(2) }));

    await drain();

    expect(fetchMock).toHaveBeenCalledTimes(2); // 413 (tooLarge) → retry → 200
    expect(await sendQueue.getValue()).toEqual([]);
    expect(await hasSent(urn(1))).toBe(true);
    expect(await hasSent(urn(2))).toBe(true);
  });

  it('drops a lone post that keeps drawing 413 (cannot be sent), then terminates', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetchSequence(() => jsonResponse(413, { error: { code: 'payload_too_large' } }));
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    await drain(); // must terminate (loop halves maxPosts to 1, then drops)

    expect(await sendQueue.getValue()).toEqual([]);
    expect(await hasSent(urn(1))).toBe(false); // dropped, never marked sent
  });

  it('backs off (schedules a retry) when a local storage read throws mid-drain', async () => {
    const create = vi.spyOn(browser.alarms, 'create');
    stubFetchSequence(ok200);
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));
    // Simulate a storage failure (e.g. QuotaExceededError) on the next queue read.
    vi.spyOn(sendQueue, 'getValue').mockRejectedValueOnce(new Error('quota exceeded'));

    await drain();

    expect(create).toHaveBeenCalledTimes(1); // retry scheduled instead of an unhandled rejection
    expect((await sendRetry.getValue()).failureStreak).toBe(1);
  });
});
