import { vi } from 'vitest';

/** Build a JSON `Response` with the given status (mirrors what the backend sends). */
export const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Stub global `fetch` with `impl`; returns the mock so callers can assert on `[url, init]` tuples. */
export const stubFetch = (
  impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
) => {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
};

/** Stub `fetch` with a sequence of response factories; each call shifts the next (last one repeats). */
export const stubFetchSequence = (...responses: Array<() => Response | Promise<Response>>) => {
  let i = 0;
  const mock = vi.fn(() => Promise.resolve(responses[Math.min(i++, responses.length - 1)]()));
  vi.stubGlobal('fetch', mock);
  return mock;
};
