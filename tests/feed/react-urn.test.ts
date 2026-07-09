import { describe, expect, it } from 'vitest';
import { extractActivityUrn } from '@/entrypoints/content/feed/react-urn';

/** A fake DOM node carrying React props (as the page context would expose them). */
function nodeWithReactProps(props: unknown): Element {
  return { ['__reactProps$abc']: props } as unknown as Element;
}

describe('extractActivityUrn', () => {
  it('finds an activity urn nested in react props', () => {
    const el = nodeWithReactProps({ tracking: { objectUrn: 'urn:li:activity:12345, more' } });
    expect(extractActivityUrn(el)).toBe('urn:li:activity:12345');
  });

  it('accepts ugcPost urns', () => {
    expect(extractActivityUrn(nodeWithReactProps({ a: 'urn:li:ugcPost:77' }))).toBe(
      'urn:li:ugcPost:77',
    );
  });

  it('skips sponsored references and takes the organic urn', () => {
    const el = nodeWithReactProps({
      ad: { u: 'urn:li:activity:999 sponsoredContent' },
      real: 'urn:li:activity:111',
    });
    expect(extractActivityUrn(el)).toBe('urn:li:activity:111');
  });

  it('returns null when there is no post urn', () => {
    expect(
      extractActivityUrn(nodeWithReactProps({ x: 'urn:li:comment:1', y: 'hello' })),
    ).toBeNull();
  });

  it('ignores non-react properties', () => {
    expect(
      extractActivityUrn({ data: { u: 'urn:li:activity:5' } } as unknown as Element),
    ).toBeNull();
  });

  it('does not throw on cyclic props', () => {
    const cyclic: Record<string, unknown> = { u: 'urn:li:activity:8' };
    cyclic.self = cyclic;
    expect(extractActivityUrn(nodeWithReactProps(cyclic))).toBe('urn:li:activity:8');
  });
});
