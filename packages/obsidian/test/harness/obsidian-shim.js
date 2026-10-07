// A browser stand-in for the obsidian module, for looking at the plugin in an ordinary page (build.mjs). It adds
// Obsidian's element helpers to the DOM and draws icons as their names. Not Obsidian: no vault, no workspace.
const P = HTMLElement.prototype, S = SVGElement.prototype;
function info(e, o = {}) {
  if (typeof o === 'string') o = { cls: o };
  if (o.cls) e.classList.add(...(Array.isArray(o.cls) ? o.cls : o.cls.split(' ')));
  if (o.text !== undefined) e.textContent = o.text;
  for (const [k, v] of Object.entries(o.attr ?? {})) if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : String(v));
  if (o.type) e.setAttribute('type', o.type);
  return e;
}
for (const proto of [P, S]) {
  proto.createEl = function (tag, o, cb) { const e = info(this.ownerDocument.createElement(tag), o); this.appendChild(e); cb?.(e); return e; };
  proto.createDiv = function (o, cb) { return this.createEl('div', o, cb); };
  proto.createSpan = function (o, cb) { return this.createEl('span', o, cb); };
  proto.empty = function () { while (this.firstChild) this.firstChild.remove(); };
  proto.setText = function (t) { this.textContent = t; };
  proto.appendText = function (t) { this.append(t); };
  proto.addClass = function (...c) { this.classList.add(...c); };
  proto.removeClass = function (...c) { this.classList.remove(...c); };
  proto.toggleClass = function (c, on) { this.classList.toggle(c, on); };
  proto.hasClass = function (c) { return this.classList.contains(c); };
  proto.setAttr = function (n, v) { if (v === null) this.removeAttribute(n); else this.setAttribute(n, v); };
  proto.setCssProps = function (p) { for (const [k, v] of Object.entries(p)) this.style.setProperty(k, v); };
  proto.setCssStyles = function (p) { Object.assign(this.style, p); };
}
window.activeDocument = document;
window.activeWindow = window;

export class Component {
  constructor() { this._children = []; this._cleanups = []; this._loaded = false; }
  load() { this._loaded = true; this.onload?.(); this._children.forEach((c) => c.load()); }
  unload() { this._children.forEach((c) => c.unload()); this._cleanups.splice(0).forEach((f) => f()); this.onunload?.(); }
  addChild(c) { this._children.push(c); if (this._loaded) c.load(); return c; }
  removeChild(c) { this._children = this._children.filter((x) => x !== c); c.unload(); return c; }
  register(f) { this._cleanups.push(f); }
  registerDomEvent(el, type, fn, opts) { el.addEventListener(type, fn, opts); this._cleanups.push(() => el.removeEventListener(type, fn, opts)); }
}
export class MarkdownRenderChild extends Component { constructor(el) { super(); this.containerEl = el; } }
export const processors = new Map();
export class Plugin extends Component {
  registerMarkdownCodeBlockProcessor(lang, fn) { processors.set(lang, fn); }
}
export class Notice { constructor(m) { console.log('Notice:', m); const n = document.body.createDiv({ cls: 'harness-notice', text: m }); setTimeout(() => n.remove(), 4000); } }
const GLYPH = { 'zoom-in': '+', 'zoom-out': '−', maximize: '⤢', expand: '⛶', minimize: '⤡', pencil: '✎', 'alert-triangle': '⚠', 'check-circle': '✓', x: '✕', copy: '⧉' };
export function setIcon(el, icon) { el.setAttribute('data-icon', icon); el.prepend(Object.assign(document.createElement('span'), { className: 'harness-icon', textContent: GLYPH[icon] ?? icon })); }
export function setTooltip(el, t) { el.title = t; }
export const Platform = { isMobile: false, isDesktop: true };
