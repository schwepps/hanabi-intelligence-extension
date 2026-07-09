import { fakeBrowser } from 'wxt/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { linkSensor, normalizeToken, sensorIdentity } from '@/shared/identity';
import type { SensorProfile } from '@/shared/sensor-api';

describe('normalizeToken', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeToken('  abcdefgh  ')).toBe('abcdefgh');
  });

  it('rejects blank and too-short tokens', () => {
    expect(normalizeToken('')).toBeNull();
    expect(normalizeToken('   ')).toBeNull();
    expect(normalizeToken('short')).toBeNull();
  });
});

describe('linkSensor', () => {
  beforeEach(() => fakeBrowser.reset());

  it('persists the token + profile with a linkedAt stamp', async () => {
    const profile: SensorProfile = {
      id: 's1',
      name: 'Camille Roy',
      email: 'camille@hanabi.test',
      consented_at: null,
    };
    await linkSensor('raw-token-123', profile);

    const stored = await sensorIdentity.getValue();
    expect(stored).toMatchObject({
      token: 'raw-token-123',
      id: 's1',
      name: 'Camille Roy',
      email: 'camille@hanabi.test',
    });
    expect(typeof stored?.linkedAt).toBe('number');
  });
});
