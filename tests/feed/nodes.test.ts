// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { findFeedRoot, findPostNodes, isPostNode } from '@/entrypoints/content/feed/nodes';
import { fragment } from '../support/dom';

describe('findFeedRoot', () => {
  it('locates the mainFeed container', () => {
    const doc = fragment('<div><main><div data-testid="mainFeed"></div></main></div>');
    expect(findFeedRoot(doc)?.getAttribute('data-testid')).toBe('mainFeed');
  });
  it('returns null when absent', () => {
    expect(findFeedRoot(fragment('<div><main></main></div>'))).toBeNull();
  });
});

describe('isPostNode / findPostNodes', () => {
  it('accepts a node with an author link and a body', () => {
    const post = fragment(
      '<div><a href="https://www.linkedin.com/in/x/">Ada</a><div data-testid="expandable-text-box">hi</div></div>',
    );
    expect(isPostNode(post)).toBe(true);
  });
  it('rejects a node missing an author link', () => {
    expect(isPostNode(fragment('<div><div data-testid="expandable-text-box">hi</div></div>'))).toBe(
      false,
    );
  });
  it('returns only post-like direct children of the feed', () => {
    const feed = fragment(`
      <div data-testid="mainFeed">
        <div class="divider"></div>
        <div class="post"><a href="https://www.linkedin.com/in/a/">A</a><img /></div>
        <div class="post"><a href="https://www.linkedin.com/in/b/">B</a><div data-testid="expandable-text-box">x</div></div>
      </div>`);
    expect(findPostNodes(feed)).toHaveLength(2);
  });
});
