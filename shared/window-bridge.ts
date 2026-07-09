/**
 * MAIN ↔ ISOLATED bridge over `window.postMessage`.
 *
 * The feed reader runs in the MAIN world (it must read React props to get the post URN, which is
 * invisible to an isolated content script). The isolated content script owns consent + the feed
 * gate and cannot see React props. They coordinate over the shared window:
 *   - `hello`   MAIN → ISOLATED : "reader ready, what's the state?" (covers load-order races)
 *   - `control` ISOLATED → MAIN : enable/disable capture (consent + on-feed)
 *   - `capture` MAIN → ISOLATED : extracted post payloads (isolated side dedups + forwards)
 *
 * ⚠️ Trust boundary. A `window.postMessage` bridge is INHERENTLY page-visible: any script running in
 * the linkedin.com page (LinkedIn's own code, an injected/ad script) shares this window+origin, so
 * `event.source`/`event.origin` cannot distinguish our MAIN reader from a page script. Consequences:
 *   - Inbound: messages are forgeable. `readBridgeMessage` runtime-validates `kind` + field shapes,
 *     and the isolated consumer additionally validates every captured post (see content/index.ts)
 *     before dedup/forward — source/origin checks are NOT authentication, so this schema validation
 *     is the real guard against injected/malformed payloads.
 *   - Outbound: `capture` payloads are readable by any page script. This is an accepted limitation of
 *     the two-world split — the fields are all already in the rendered DOM those scripts can read, so
 *     there is no PII loss to LinkedIn; the residual concern is detectability. Minimizing what crosses
 *     (e.g. only the URN, extracting isolated-side) is a possible future hardening, at the cost of
 *     MAIN↔ISOLATED node correlation.
 */
import type { PostPayload } from '@/shared/payload';

export const BRIDGE_SOURCE = 'hanabi-feed-bridge';

export interface HelloMessage {
  source: typeof BRIDGE_SOURCE;
  kind: 'hello';
}
export interface ControlMessage {
  source: typeof BRIDGE_SOURCE;
  kind: 'control';
  enabled: boolean;
}
export interface CaptureMessage {
  source: typeof BRIDGE_SOURCE;
  kind: 'capture';
  posts: PostPayload[];
}
export type BridgeMessage = HelloMessage | ControlMessage | CaptureMessage;

export function postHello(): void {
  post({ source: BRIDGE_SOURCE, kind: 'hello' });
}
export function postControl(enabled: boolean): void {
  post({ source: BRIDGE_SOURCE, kind: 'control', enabled });
}
export function postCapture(posts: PostPayload[]): void {
  post({ source: BRIDGE_SOURCE, kind: 'capture', posts });
}

/**
 * Narrow a `message` event to a same-window, same-origin bridge message, runtime-validating the
 * discriminant `kind` and its fields (the data is untrusted — see the header). Payload contents of a
 * `capture` are validated further downstream (content/index.ts). Returns null on any mismatch.
 */
export function readBridgeMessage(event: MessageEvent): BridgeMessage | null {
  if (event.source !== window || event.origin !== window.location.origin) return null;
  const data = event.data as {
    source?: unknown;
    kind?: unknown;
    enabled?: unknown;
    posts?: unknown;
  };
  if (typeof data !== 'object' || data === null || data.source !== BRIDGE_SOURCE) return null;

  switch (data.kind) {
    case 'hello':
      return { source: BRIDGE_SOURCE, kind: 'hello' };
    case 'control':
      return typeof data.enabled === 'boolean'
        ? { source: BRIDGE_SOURCE, kind: 'control', enabled: data.enabled }
        : null;
    case 'capture':
      return Array.isArray(data.posts)
        ? { source: BRIDGE_SOURCE, kind: 'capture', posts: data.posts as PostPayload[] }
        : null;
    default:
      return null;
  }
}

/** Max posts accepted from a single (forgeable) capture message. */
export const MAX_CAPTURE_POSTS = 100;

const POST_URN_RE = /^urn:li:(?:activity|ugcPost):\d+$/;

function isLinkedInUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).hostname.replace(/^www\./, '').endsWith('linkedin.com');
  } catch {
    return false;
  }
}

/**
 * Validate an inbound capture payload before it is trusted/forwarded. The bridge is forgeable, so a
 * `capture` message can carry arbitrary objects — accept only well-formed posts: a real post URN as
 * the dedup key, linkedin.com hosts on the urls, and the right container types.
 */
export function isValidCapturedPost(value: unknown): value is PostPayload {
  if (typeof value !== 'object' || value === null) return false;
  const post = value as Record<string, unknown>;
  return (
    typeof post.linkedin_post_id === 'string' &&
    POST_URN_RE.test(post.linkedin_post_id) &&
    isLinkedInUrl(post.url) &&
    (post.author_profile_url === null || isLinkedInUrl(post.author_profile_url)) &&
    typeof post.reaction_count === 'number' &&
    typeof post.comment_count === 'number' &&
    Array.isArray(post.hashtags) &&
    Array.isArray(post.comments)
  );
}

function post(message: BridgeMessage): void {
  window.postMessage(message, window.location.origin);
}
