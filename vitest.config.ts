import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// WxtVitest wires WXT auto-imports and a fake `browser` API into the test runtime.
// See https://wxt.dev/guide/essentials/unit-testing.html
export default defineConfig({
  plugins: [WxtVitest()],
});
