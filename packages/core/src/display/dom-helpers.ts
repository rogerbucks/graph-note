// The DOM helpers the display layer draws with (editor spec §26, cc_core_only). The layer is written as Obsidian's pages
// are, with `createDiv`, `createEl`, `setText`, `empty`, `addClass` and the rest on elements, and `activeWindow` and
// `activeDocument` for the window in use. Obsidian provides them; a plain browser page does not, so its host calls
// `installDomHelpers(window)` once before anything is drawn. Each helper is added only where it is missing, so in
// Obsidian this changes nothing, and each does what Obsidian's does for the way the layer uses it.

/** What `createEl` and `createDiv` take: a class or classes, text, attributes, a title, a parent, and an input's value and type. */
export interface ElementInfo {
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  parent?: Node;
  value?: string;
  type?: string;
  prepend?: boolean;
  placeholder?: string;
  href?: string;
}

/** The part of a window the helpers are installed on. */
export interface HelperWindow {
  Element: { prototype: object };
  HTMLElement: { prototype: object };
  SVGElement: { prototype: object };
  document: object;
}

const SVG = 'http://www.w3.org/2000/svg';

/** The element a node is, as the helpers use it: any DOM element with its methods. */
type Host = Element & {
  ownerDocument: Document;
  style: CSSStyleDeclaration;
  createEl: (tag: string, o?: ElementInfo | string, cb?: (el: HTMLElement) => void) => HTMLElement;
};

function made(
  parent: Host,
  tag: string,
  o: ElementInfo | string | undefined,
  cb: ((el: never) => void) | undefined,
  svg: boolean,
) {
  const info: ElementInfo = typeof o === 'string' ? { cls: o } : (o ?? {});
  const doc = parent.ownerDocument;
  const el = (svg ? doc.createElementNS(SVG, tag) : doc.createElement(tag)) as HTMLElement & { href?: string };
  if (info.cls) el.classList.add(...(Array.isArray(info.cls) ? info.cls : info.cls.split(/\s+/).filter(Boolean)));
  if (info.text !== undefined)
    el.textContent = typeof info.text === 'string' ? info.text : (info.text.textContent ?? '');
  for (const [k, v] of Object.entries(info.attr ?? {})) if (v !== null) el.setAttribute(k, String(v));
  if (info.title !== undefined) el.title = info.title;
  const input = el as unknown as HTMLInputElement;
  if (info.type !== undefined) input.type = info.type;
  if (info.value !== undefined) input.value = info.value;
  if (info.placeholder !== undefined) input.placeholder = info.placeholder;
  if (info.href !== undefined) el.setAttribute('href', info.href);
  const into = (info.parent as Node | undefined) ?? parent;
  if (info.prepend && into.firstChild) into.insertBefore(el, into.firstChild);
  else into.appendChild(el);
  cb?.(el as never);
  return el;
}

/** Puts the helpers on `win`'s elements and `activeWindow` and `activeDocument` on `win`, where they are missing. */
export function installDomHelpers(win: HelperWindow): void {
  const methods: Record<string, (this: Host, ...args: never[]) => unknown> = {
    createEl(this: Host, tag: string, o?: ElementInfo | string, cb?: (el: never) => void) {
      return made(this, tag, o, cb, false);
    },
    createDiv(this: Host, o?: ElementInfo | string, cb?: (el: never) => void) {
      return made(this, 'div', o, cb, false);
    },
    createSpan(this: Host, o?: ElementInfo | string, cb?: (el: never) => void) {
      return made(this, 'span', o, cb, false);
    },
    createSvg(this: Host, tag: string, o?: ElementInfo | string, cb?: (el: never) => void) {
      return made(this, tag, o, cb, true);
    },
    empty(this: Host) {
      this.replaceChildren();
    },
    appendText(this: Host, text: string) {
      this.appendChild(this.ownerDocument.createTextNode(text));
    },
    setText(this: Host, text: string | DocumentFragment) {
      this.textContent = typeof text === 'string' ? text : (text.textContent ?? '');
    },
    addClass(this: Host, ...classes: string[]) {
      this.classList.add(...classes);
    },
    removeClass(this: Host, ...classes: string[]) {
      this.classList.remove(...classes);
    },
    toggleClass(this: Host, classes: string | string[], on: boolean) {
      for (const c of Array.isArray(classes) ? classes : [classes]) this.classList.toggle(c, on);
    },
    hasClass(this: Host, cls: string) {
      return this.classList.contains(cls);
    },
    setCssProps(this: Host, props: Record<string, string>) {
      for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
    },
    setCssStyles(this: Host, styles: Record<string, string>) {
      Object.assign(this.style, styles);
    },
  };
  const getters: Record<string, (this: Host) => unknown> = {
    doc(this: Host) {
      return this.ownerDocument;
    },
    win(this: Host) {
      return this.ownerDocument.defaultView;
    },
  };
  for (const proto of [win.Element.prototype, win.HTMLElement.prototype, win.SVGElement.prototype]) {
    for (const [name, value] of Object.entries(methods))
      if (!(name in proto)) Object.defineProperty(proto, name, { value, configurable: true, writable: true });
    for (const [name, get] of Object.entries(getters))
      if (!(name in proto)) Object.defineProperty(proto, name, { get, configurable: true });
  }
  const w = win as unknown as Record<string, unknown>;
  w.activeWindow ??= win;
  w.activeDocument ??= win.document;
}
