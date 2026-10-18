// The types of the DOM helpers the layer draws with (dom-helpers.ts), for the layer's own type check. In the Obsidian
// plugin's type check the same helpers come from Obsidian's own declarations. So this file is read by the layer's
// tsconfig alone, and no module imports it.
interface ElementInfo {
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

interface Node {
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: ElementInfo | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
  ): HTMLElementTagNameMap[K];
  createDiv(o?: ElementInfo | string, callback?: (el: HTMLDivElement) => void): HTMLDivElement;
  createSpan(o?: ElementInfo | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement;
  createSvg<K extends keyof SVGElementTagNameMap>(
    tag: K,
    o?: ElementInfo | string,
    callback?: (el: SVGElementTagNameMap[K]) => void,
  ): SVGElementTagNameMap[K];
  empty(): void;
  appendText(text: string): void;
  /** The document this node belongs to. */
  doc: Document;
  /** The window this node belongs to. */
  win: Window;
}

interface Element {
  setText(text: string | DocumentFragment): void;
  addClass(...classes: string[]): void;
  removeClass(...classes: string[]): void;
  toggleClass(classes: string | string[], on: boolean): void;
  hasClass(cls: string): boolean;
}

interface HTMLElement {
  setCssProps(props: Record<string, string>): void;
  setCssStyles(styles: Partial<CSSStyleDeclaration>): void;
}

interface SVGElement {
  setCssProps(props: Record<string, string>): void;
  setCssStyles(styles: Partial<CSSStyleDeclaration>): void;
}

/** The window in use, which is the page's own outside Obsidian's popout windows. */
declare let activeWindow: Window;
/** The document in use. */
declare let activeDocument: Document;
