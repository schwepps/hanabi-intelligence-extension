import { describe, expect, it, vi } from 'vitest';
import {
  CaptureController,
  type CaptureControllerDeps,
} from '@/entrypoints/content/capture-controller';
import type { PostPayload } from '@/shared/payload';
import { stubPayload } from '../support/factories';

/** Fake "post root" carrying just an id — the controller only ever passes it to injected deps. */
const fakeRoot = (id: string): Element => ({ id }) as unknown as Element;
const rootId = (root: Element): string => (root as unknown as { id: string }).id;

const emittedIds = (emit: ReturnType<typeof vi.fn>): string[] =>
  emit.mock.calls.map((call) => (call[0] as PostPayload).linkedin_post_id);

describe('CaptureController', () => {
  it('sweeps present posts, emits each once, and dedups across settles', async () => {
    const emit = vi.fn();
    let settle: () => void = () => {};
    const roots = [fakeRoot('a'), fakeRoot('b')];

    const deps: CaptureControllerDeps = {
      findContainer: () => ({}) as unknown as Element,
      findPostRoots: () => roots,
      extract: (root) => stubPayload({ linkedin_post_id: rootId(root) }),
      emit,
      waitForContainer: (find) => Promise.resolve(find()),
      createObserver: (_target, onSettled) => {
        settle = onSettled;
        return { disconnect: vi.fn() };
      },
    };

    const controller = new CaptureController(deps);
    await controller.start();
    expect(emittedIds(emit)).toEqual(['a', 'b']); // initial sweep

    roots.push(fakeRoot('c')); // new post scrolls in
    settle(); // observer settles → re-sweep
    expect(emittedIds(emit)).toEqual(['a', 'b', 'c']); // only the new one emits again
    expect(controller.capturedCount).toBe(3);
  });

  it('skips posts whose extract returns null and disconnects the observer on stop', async () => {
    const emit = vi.fn();
    const disconnect = vi.fn();

    const controller = new CaptureController({
      findContainer: () => ({}) as unknown as Element,
      findPostRoots: () => [fakeRoot('x')],
      extract: () => null, // unresolvable post → skipped
      emit,
      waitForContainer: (find) => Promise.resolve(find()),
      createObserver: () => ({ disconnect }),
    });

    await controller.start();
    expect(emit).not.toHaveBeenCalled();

    controller.stop();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the container never appears', async () => {
    const emit = vi.fn();
    const createObserver = vi.fn();

    const controller = new CaptureController({
      findContainer: () => null,
      findPostRoots: () => [],
      extract: () => null,
      emit,
      waitForContainer: () => Promise.resolve(null),
      createObserver,
    });

    await controller.start();
    expect(emit).not.toHaveBeenCalled();
    expect(createObserver).not.toHaveBeenCalled();
  });
});
