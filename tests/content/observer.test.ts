import { afterEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '@/entrypoints/content/observer';

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('runs once, on the trailing edge, after the last call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 800);

    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(799);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel() prevents a pending invocation', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 800);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });
});
