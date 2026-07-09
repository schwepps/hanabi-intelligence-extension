import { fakeBrowser } from 'wxt/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consentGranted } from '@/shared/consent';
import { sensorIdentity } from '@/shared/identity';
import { drain, enqueueAndDrain, handleConsentChange } from '@/entrypoints/background/drain';
import { enqueue, sendQueue } from '@/entrypoints/background/queue';
import { hasSent } from '@/entrypoints/background/sent-ids';
import { retryState } from '@/entrypoints/background/backoff';
import { stubPayload } from '../support/factories';

const urn = (n: number | string) => `urn:li:activity:${n}`;
const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok200 = () => jsonResponse(200, { received: 1, new_items: 1, known_items: 0 });

/** Sequence of fetch responses; each call shifts the next (last one repeats). */
const stubFetchSequence = (...responses: Array<() => Response | Promise<Response>>) => {
  let i = 0;
  const mock = vi.fn(() => Promise.resolve(responses[Math.min(i++, responses.length - 1)]()));
  vi.stubGlobal('fetch', mock);
  return mock;
};

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
    expect((await retryState.getValue()).failureStreak).toBe(0);
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
    expect((await retryState.getValue()).failureStreak).toBe(1);
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
    expect((await retryState.getValue()).failureStreak).toBe(0);
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
              issues: [{ path: ['posts', 1, 'posted_at_raw'], message: 'too long' }],
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

  it('coalesces concurrent drains — a single in-flight send (re-entrancy guard)', async () => {
    let release!: (r: Response) => void;
    const gate = new Promise<Response>((r) => (release = r));
    const fetchMock = vi.fn(() => gate);
    vi.stubGlobal('fetch', fetchMock);
    await link();
    await enqueue(stubPayload({ linkedin_post_id: urn(1) }));

    const first = drain();
    const second = drain(); // should not start a parallel send
    release(ok200());
    await Promise.all([first, second]);
    await new Promise((r) => setTimeout(r, 0)); // let the coalesced rerun settle

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await sendQueue.getValue()).toEqual([]);
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
});
