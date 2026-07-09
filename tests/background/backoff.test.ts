import { fakeBrowser } from 'wxt/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeDelayMinutes,
  nextStreak,
  resetStreak,
  sendRetry,
} from '@/entrypoints/background/backoff';

// rng() === 1 removes jitter (factor 1.0) so the doubling is exact and easy to assert.
const noJitter = () => 1;
// rng() === 0 is the smallest jitter (factor 0.5) — exercises the 30 s floor.
const minJitter = () => 0;

describe('computeDelayMinutes', () => {
  it('doubles from a 30 s base, in minutes (jitter removed)', () => {
    expect([1, 2, 3, 4].map((s) => computeDelayMinutes(s, noJitter))).toEqual([0.5, 1, 2, 4]);
  });

  it('caps at one hour', () => {
    expect(computeDelayMinutes(99, noJitter)).toBe(60);
  });

  it('never returns below the 30 s (0.5 min) alarm floor, even at min jitter', () => {
    expect(computeDelayMinutes(1, minJitter)).toBe(0.5);
    expect(computeDelayMinutes(2, minJitter)).toBe(0.5); // 60 s * 0.5 = 30 s → floored to 30 s
  });

  it('jitter only shortens the capped delay, within [0.5x, 1x]', () => {
    // streak 5 → capped 480 s (8 min); min jitter halves to 240 s (4 min).
    expect(computeDelayMinutes(5, minJitter)).toBe(4);
    expect(computeDelayMinutes(5, noJitter)).toBe(8);
  });
});

describe('sendRetry (persisted failure streak)', () => {
  beforeEach(() => fakeBrowser.reset());

  it('defaults to a zero streak', async () => {
    expect(await sendRetry.getValue()).toEqual({ failureStreak: 0 });
  });

  it('nextStreak increments and persists, returning the new streak', async () => {
    expect(await nextStreak()).toBe(1);
    expect(await nextStreak()).toBe(2);
    expect((await sendRetry.getValue()).failureStreak).toBe(2);
  });

  it('resetStreak clears the streak back to zero', async () => {
    await nextStreak();
    await resetStreak();
    expect((await sendRetry.getValue()).failureStreak).toBe(0);
  });
});
