export default defineContentScript({
  // Site-wide match is intentional: LinkedIn is an SPA, so a content script injects once on
  // document load and persists across client-side navigation. Narrowing `matches` to /feed/*
  // would miss the feed when the sensor first lands on another page and then navigates to it.
  // Feed-only scoping is enforced at RUNTIME (a window.location gate) once capture logic lands —
  // we never read messaging, notifications or the connection graph.
  matches: ['https://www.linkedin.com/*'],
  main() {
    // Foundation only — passive feed reading (debounced MutationObserver) lands in a later ticket.
  },
});
