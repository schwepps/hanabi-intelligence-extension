/** Parse an HTML fragment and return its root element. Only usable under a DOM environment. */
export function fragment(html: string): Element {
  document.body.innerHTML = html;
  const child = document.body.firstElementChild;
  if (!child) throw new Error('fixture produced no root element');
  return child;
}
