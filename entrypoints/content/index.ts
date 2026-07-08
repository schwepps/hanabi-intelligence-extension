export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main() {
    // Foundation only — passive feed reading (debounced MutationObserver) lands in a later ticket.
  },
});
