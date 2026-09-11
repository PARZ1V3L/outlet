/** Small DOM helpers. Elements are built, never parsed from strings; the
 *  one exception is the fixed SVG assets, parsed as XML and cloned. */

type Child = Node | string | null | undefined | false;

/** Create an element with attributes and children. `true` sets a boolean
 *  attribute, `false`/`null` skips it. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | null | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    el.setAttribute(name, value === true ? "" : value);
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
}

const parsed = new Map<string, SVGSVGElement>();

/** Clone an inline SVG asset. Parsed once as XML (never through innerHTML),
 *  marked decorative: every mark in the sheet sits next to its words. */
export function svg(markup: string, className?: string): SVGSVGElement {
  let tpl = parsed.get(markup);
  if (!tpl) {
    const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
    tpl = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
    tpl.setAttribute("aria-hidden", "true");
    tpl.setAttribute("focusable", "false");
    parsed.set(markup, tpl);
  }
  const el = tpl.cloneNode(true) as SVGSVGElement;
  if (className) el.setAttribute("class", className);
  return el;
}

/** Tabbable controls inside a root, in document order. */
export function tabbables(root: ParentNode): HTMLElement[] {
  const all = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(all).filter((el) => !el.hidden && !el.closest("[hidden]"));
}
