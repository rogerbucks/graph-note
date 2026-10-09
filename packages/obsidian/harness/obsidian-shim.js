// A browser stand-in for the obsidian module, for looking at the plugin in an ordinary page (build.mjs). It adds
// Obsidian's element helpers to the DOM and draws icons as their names. Not Obsidian: no vault, no workspace.
const P = HTMLElement.prototype,
  S = SVGElement.prototype;
function info(e, o = {}) {
  if (typeof o === 'string') o = { cls: o };
  if (o.cls) e.classList.add(...(Array.isArray(o.cls) ? o.cls : o.cls.split(' ')));
  if (o.text !== undefined) e.textContent = o.text;
  for (const [k, v] of Object.entries(o.attr ?? {}))
    if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : String(v));
  if (o.type) e.setAttribute('type', o.type);
  return e;
}
for (const proto of [P, S]) {
  proto.createEl = function (tag, o, cb) {
    const e = info(this.ownerDocument.createElement(tag), o);
    this.appendChild(e);
    cb?.(e);
    return e;
  };
  proto.createDiv = function (o, cb) {
    return this.createEl('div', o, cb);
  };
  proto.createSpan = function (o, cb) {
    return this.createEl('span', o, cb);
  };
  proto.empty = function () {
    while (this.firstChild) this.firstChild.remove();
  };
  proto.setText = function (t) {
    this.textContent = t;
  };
  proto.appendText = function (t) {
    this.append(t);
  };
  proto.addClass = function (...c) {
    this.classList.add(...c);
  };
  proto.removeClass = function (...c) {
    this.classList.remove(...c);
  };
  proto.toggleClass = function (c, on) {
    this.classList.toggle(c, on);
  };
  proto.hasClass = function (c) {
    return this.classList.contains(c);
  };
  proto.setAttr = function (n, v) {
    if (v === null) this.removeAttribute(n);
    else this.setAttribute(n, v);
  };
  proto.setCssProps = function (p) {
    for (const [k, v] of Object.entries(p)) this.style.setProperty(k, v);
  };
  proto.setCssStyles = function (p) {
    Object.assign(this.style, p);
  };
}
window.activeDocument = document;
window.activeWindow = window;

export class Component {
  constructor() {
    this._children = [];
    this._cleanups = [];
    this._loaded = false;
  }
  load() {
    this._loaded = true;
    this.onload?.();
    this._children.forEach((c) => c.load());
  }
  unload() {
    this._children.forEach((c) => c.unload());
    this._cleanups.splice(0).forEach((f) => f());
    this.onunload?.();
  }
  addChild(c) {
    this._children.push(c);
    if (this._loaded) c.load();
    return c;
  }
  removeChild(c) {
    this._children = this._children.filter((x) => x !== c);
    c.unload();
    return c;
  }
  register(f) {
    this._cleanups.push(f);
  }
  registerDomEvent(el, type, fn, opts) {
    el.addEventListener(type, fn, opts);
    this._cleanups.push(() => el.removeEventListener(type, fn, opts));
  }
  registerEvent() {}
}
export class MarkdownRenderChild extends Component {
  constructor(el) {
    super();
    this.containerEl = el;
  }
}
import { StateField } from '@codemirror/state';
// Obsidian's global helper: an element not yet on the page
globalThis.createDiv = (o = {}) => info(document.createElement('div'), o);
/** Obsidian's own editor fields: whether an editor is in Live Preview, and which file it shows. */
export const editorLivePreviewField = StateField.define({ create: () => true, update: (v) => v });
export const editorInfoField = StateField.define({ create: () => ({ file: null }), update: (v) => v });
/** No note is open in an Obsidian editor here: the plugin writes the file, and the stand-in editor follows it. */
export class MarkdownView {}
export const processors = new Map();
// the editor extensions the plugin registers, for the stand-in Live Preview
export const editorExtensions = [];
export const views = new Map();
export class TFile {
  constructor(path) {
    this.path = path;
    this.name = path;
    this.extension = 'md';
  }
}
// One note in memory, as the vault; changes are reported as Obsidian reports them.
export const files = new Map();
const listeners = [];
const vault = {
  getFileByPath: (p) => (files.has(p) ? new TFile(p) : null),
  read: async (f) => files.get(f.path),
  process: async (f, fn) => {
    const next = fn(files.get(f.path));
    if (next !== files.get(f.path)) {
      files.set(f.path, next);
      listeners.forEach((l) => l(new TFile(f.path)));
    }
    return next;
  },
  modify: async (f, t) => {
    files.set(f.path, t);
    listeners.forEach((l) => l(new TFile(f.path)));
  },
  on: (name, cb) => {
    if (name === 'modify') listeners.push(cb);
    return { cb };
  },
};
const leaves = [];
class WorkspaceLeaf {
  constructor() {
    this.view = null;
  }
  async setViewState({ type, state }) {
    if (!this.view) {
      this.view = views.get(type)(this);
      document.getElementById('pane').appendChild(this.view.containerEl);
      this.view.load();
      await this.view.onOpen?.();
    }
    await this.view.setState?.(state, {});
  }
}
const workspace = {
  getLeavesOfType: (t) => leaves.filter((l) => l.view?.getViewType() === t),
  getLeaf: () => {
    const l = new WorkspaceLeaf();
    leaves.push(l);
    return l;
  },
  revealLeaf: async () => {},
};
export const app = { vault, workspace };
export class ItemView extends Component {
  constructor(leaf) {
    super();
    this.leaf = leaf;
    this.app = app;
    this.containerEl = document.createElement('div');
    this.containerEl.createDiv({ cls: 'view-header' });
    this.contentEl = this.containerEl.createDiv({ cls: 'view-content' });
  }
  registerEvent() {}
  async setState() {}
}
export class Plugin extends Component {
  constructor() {
    super();
    this.app = app;
  }
  registerMarkdownCodeBlockProcessor(lang, fn) {
    processors.set(lang, fn);
  }
  registerView(type, f) {
    views.set(type, f);
  }
  registerEditorExtension(ext) {
    editorExtensions.push(...(Array.isArray(ext) ? ext : [ext]));
  }
  async loadData() {
    return null;
  }
  async saveData() {}
}
export class Notice {
  constructor(m) {
    console.log('Notice:', m);
    const n = document.body.createDiv({ cls: 'harness-notice', text: m });
    setTimeout(() => n.remove(), 4000);
  }
}
/** Obsidian's menu, enough to try one in a browser: a list of items under the pointer, closed by a pick or a click away. */
export class Menu {
  constructor() {
    this.items = [];
  }
  addItem(build) {
    const item = { title: '', checked: false };
    const api = {
      setTitle: (t) => ((item.title = t), api),
      setIcon: () => api,
      setChecked: (c) => ((item.checked = c), api),
      setSection: () => api,
      setWarning: () => api,
      onClick: (f) => ((item.click = f), api),
    };
    build(api);
    this.items.push(item);
    return this;
  }
  addSeparator() {
    return this;
  }
  showAtMouseEvent(e) {
    return this.showAtPosition({ x: e.clientX, y: e.clientY });
  }
  showAtPosition({ x, y }) {
    const el = document.body.createDiv({ cls: 'menu' });
    Object.assign(el.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, zIndex: 100 });
    for (const it of this.items) {
      const row = el.createDiv({ cls: 'menu-item', text: `${it.checked ? '✓ ' : ''}${it.title}` });
      row.addEventListener('click', (e) => {
        close();
        it.click?.(e);
      });
    }
    const close = () => {
      el.remove();
      document.removeEventListener('pointerdown', away, true);
    };
    const away = (e) => {
      if (!el.contains(e.target)) close();
    };
    setTimeout(() => document.addEventListener('pointerdown', away, true));
    return this;
  }
  hide() {
    return this;
  }
}
const GLYPH = {
  'zoom-in': '+',
  'zoom-out': '−',
  maximize: '⤢',
  expand: '⛶',
  minimize: '⤡',
  pencil: '✎',
  'alert-triangle': '⚠',
  'check-circle': '✓',
  x: '✕',
  copy: '⧉',
};
export function setIcon(el, icon) {
  el.setAttribute('data-icon', icon);
  el.prepend(
    Object.assign(document.createElement('span'), { className: 'harness-icon', textContent: GLYPH[icon] ?? icon }),
  );
}
export function setTooltip(el, t) {
  el.title = t;
}
export const Platform = { isMobile: false, isDesktop: true };
