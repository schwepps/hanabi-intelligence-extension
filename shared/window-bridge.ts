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
 * Page scripts share this window and could forge messages; the payload only flows to our background
 * and is validated server-side (FSC-98), so the exposure is limited. Receivers still check
 * `event.source`/`event.origin` and the tag.
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

/** Narrow a `message` event to a same-window, same-origin bridge message. */
export function readBridgeMessage(event: MessageEvent): BridgeMessage | null {
  if (event.source !== window || event.origin !== window.location.origin) return null;
  const data = event.data as { source?: unknown };
  if (typeof data !== 'object' || data === null || data.source !== BRIDGE_SOURCE) return null;
  return event.data as BridgeMessage;
}

function post(message: BridgeMessage): void {
  window.postMessage(message, window.location.origin);
}
