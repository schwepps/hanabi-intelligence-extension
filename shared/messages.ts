/**
 * Typed content → background message contract.
 *
 * WXT ships no messaging wrapper. For a single message type a hand-typed wrapper over
 * `browser.runtime` gives full inference at zero dependency cost; migrate to a protocol-map lib
 * (e.g. `@webext-core/messaging`) only if the protocol grows to several message types.
 */
import type { PostPayload } from '@/shared/payload';

export const POST_CAPTURED = 'postCaptured' as const;

export interface PostCapturedMessage {
  type: typeof POST_CAPTURED;
  payload: PostPayload;
}

export function isPostCapturedMessage(message: unknown): message is PostCapturedMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === POST_CAPTURED
  );
}

/**
 * Fire-and-forget: capture must never block the sensor's scroll on a background ack. If the
 * service worker is waking or momentarily absent (mid-reload), the send rejects and we drop it —
 * durable delivery is the send-queue ticket's responsibility, not FSC-110's.
 */
export function sendPostCaptured(payload: PostPayload): void {
  const message: PostCapturedMessage = { type: POST_CAPTURED, payload };
  void browser.runtime.sendMessage(message).catch(() => {
    /* no receiving end / SW waking — acceptable pre-queue */
  });
}

/** Register a background listener for captured posts. */
export function onPostCaptured(handler: (payload: PostPayload) => void): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isPostCapturedMessage(message)) {
      handler(message.payload);
    }
    // No `return true`: fire-and-forget, we do not keep the message channel open for a response.
  });
}
