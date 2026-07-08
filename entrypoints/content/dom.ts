/**
 * DOM helpers that always operate on an explicit `root` — never the global `document`.
 * This keeps every extractor a pure `(root: Element) => T` function, unit-testable against parsed
 * fixture fragments. Each helper takes an ORDERED list of candidate selectors (most-stable first)
 * and returns on the first hit, which is how the selector map degrades gracefully (see selectors.ts).
 */

/** First descendant matching any of the ordered selectors, or null. */
export function queryFirst(root: ParentNode, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const found = root.querySelector(selector);
    if (found) return found;
  }
  return null;
}

/** Trimmed non-empty text of the first matching descendant, else null. */
export function queryText(root: ParentNode, selectors: readonly string[]): string | null {
  const el = queryFirst(root, selectors);
  return cleanText(el?.textContent);
}

/** Trimmed non-empty value of `attr` on the first matching descendant, else null. */
export function queryAttr(
  root: ParentNode,
  selectors: readonly string[],
  attr: string,
): string | null {
  const el = queryFirst(root, selectors);
  const value = el?.getAttribute(attr)?.trim();
  return value ? value : null;
}

/** Every descendant matching any selector, de-duplicated. */
export function queryAll(root: ParentNode, selectors: readonly string[]): Element[] {
  const seen = new Set<Element>();
  for (const selector of selectors) {
    for (const el of root.querySelectorAll(selector)) {
      seen.add(el);
    }
  }
  return [...seen];
}

/** Collapse whitespace and trim; returns null for empty/whitespace-only input. */
export function cleanText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text ? text : null;
}
