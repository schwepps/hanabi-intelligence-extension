import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSensorProfile, recordSensorConsent } from '@/shared/sensor-api';
import { jsonResponse, stubFetch } from '../support/fetch';

describe('sensor-api client', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('fetchSensorProfile returns the profile and sends the bearer token', async () => {
    const profile = { id: 's1', name: 'Camille Roy', email: 'c@hanabi.test', consented_at: null };
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(200, profile)));

    await expect(fetchSensorProfile('raw-token-123')).resolves.toEqual(profile);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/sensor/me');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer raw-token-123' });
  });

  it('fetchSensorProfile returns null on 401 (invalid token)', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(401, { error: { code: 'unauthorized' } })));
    await expect(fetchSensorProfile('bad')).resolves.toBeNull();
  });

  it('fetchSensorProfile throws on a server error (not a token problem)', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(500, { error: { code: 'server_error' } })));
    await expect(fetchSensorProfile('raw-token-123')).rejects.toThrow(/500/);
  });

  it('recordSensorConsent POSTs the token and returns the timestamp', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { consented_at: '2026-07-09T00:00:00Z' })),
    );

    await expect(recordSensorConsent('raw-token-123')).resolves.toBe('2026-07-09T00:00:00Z');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/sensor/consent');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer raw-token-123' });
  });

  it('recordSensorConsent throws on a non-OK status', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(401, { error: { code: 'unauthorized' } })));
    await expect(recordSensorConsent('bad')).rejects.toThrow(/401/);
  });
});
