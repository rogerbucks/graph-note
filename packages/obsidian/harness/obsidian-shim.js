// A browser stand-in for the obsidian module, for looking at the plugin in an ordinary page (build.mjs). It adds
// Obsidian's element helpers to the DOM and draws icons as their names. Not Obsidian: one note in memory as the vault, and no settings page or command palette.
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
// an element's document and window, as Obsidian gives every element them
for (const proto of [P, S])
  for (const [name, get] of [
    ['doc', (n) => n.ownerDocument],
    ['win', (n) => n.ownerDocument.defaultView],
  ])
    if (!(name in proto))
      Object.defineProperty(proto, name, {
        get() {
          return get(this);
        },
        configurable: true,
      });
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
// Obsidian's global helpers: an element not yet on the page
globalThis.createDiv = (o = {}) => info(document.createElement('div'), o);
globalThis.createSpan = (o = {}) => info(document.createElement('span'), o);
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
  getResourcePath: (f) => `app://local/${f.path}`,
  read: async (f) => files.get(f.path),
  process: async (f, fn) => {
    const next = fn(files.get(f.path));
    if (next !== files.get(f.path)) {
      files.set(f.path, next);
      listeners.forEach((l) => l(new TFile(f.path)));
    }
    return next;
  },
  cachedRead: async (f) => files.get(f.path),
  getMarkdownFiles: () => [...files.keys()].map((p) => new TFile(p)),
  getFiles: () => [...files.keys()].map((p) => new TFile(p)),
  getAbstractFileByPath: (p) => (files.has(p) ? new TFile(p) : null),
  create: async (p, t) => {
    files.set(p, t);
    return new TFile(p);
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
  // the plugin writes the note, and the stand-in editor follows it: no note is open in an Obsidian editor
  getActiveFile: () => null,
  // a link followed from a card (§18): the browser view has one note, so a link to another opens nothing, and a hover
  // previews nothing
  openLinkText: async () => {},
  trigger: () => {},
};
// nothing is indexed here, so a note's front matter is read from its text, and a link finds a note by its path alone
const metadataCache = {
  getFileCache: () => null,
  getFirstLinkpathDest: (link) => vault.getAbstractFileByPath(link) ?? vault.getAbstractFileByPath(`${link}.md`),
};
// a note a broken link names is made in the vault's root, as Obsidian's default puts a new note
const fileManager = { getNewFileParent: () => ({ path: '/' }) };
export const app = { vault, workspace, metadataCache, fileManager };
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
  // the browser view has no settings page, no command palette and no Page preview
  addSettingTab() {}
  registerHoverLinkSource() {}
  addCommand(c) {
    return c;
  }
  async loadData() {
    return null;
  }
  async saveData() {}
}
/** A settings tab: the browser view has no settings page, so it is never shown. */
export class PluginSettingTab {
  constructor(a, plugin) {
    this.app = a;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }
  display() {}
  hide() {}
}
/** A field for a secret: the browser view keeps none. */
export class SecretComponent {
  constructor(_a, el) {
    this.inputEl = el.createEl('input', { type: 'password' });
  }
  setValue() {
    return this;
  }
  onChange() {
    return this;
  }
}
/** A dialog: a box over the page, with its title and content, taken away when closed. */
export class Modal {
  constructor(a) {
    this.app = a;
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal';
    this.titleEl = this.modalEl.createDiv({ cls: 'modal-title' });
    this.contentEl = this.modalEl.createDiv({ cls: 'modal-content' });
  }
  setTitle(t) {
    this.titleEl.setText(t);
    return this;
  }
  open() {
    document.body.appendChild(this.modalEl);
    this.onOpen?.();
  }
  close() {
    this.onClose?.();
    this.modalEl.remove();
  }
}
/** A row of a dialog or settings page: its name, its description and its controls, enough for the send dialog. */
export class Setting {
  constructor(el) {
    this.settingEl = el.createDiv({ cls: 'setting-item' });
    const infoEl = this.settingEl.createDiv({ cls: 'setting-item-info' });
    this.nameEl = infoEl.createDiv({ cls: 'setting-item-name' });
    this.descEl = infoEl.createDiv({ cls: 'setting-item-description' });
    this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-control' });
  }
  setName(t) {
    this.nameEl.setText(t);
    return this;
  }
  setDesc(t) {
    this.descEl.setText(t);
    return this;
  }
  addDropdown(cb) {
    const sel = this.controlEl.createEl('select');
    const c = {
      addOption: (v, n) => (sel.createEl('option', { text: n, attr: { value: v } }), c),
      setValue: (v) => ((sel.value = v), c),
      onChange: (f) => (sel.addEventListener('change', () => f(sel.value)), c),
    };
    cb(c);
    return this;
  }
  addToggle(cb) {
    const t = this.controlEl.createEl('input', { type: 'checkbox' });
    const c = {
      setValue: (v) => ((t.checked = !!v), c),
      onChange: (f) => (t.addEventListener('change', () => f(t.checked)), c),
    };
    cb(c);
    return this;
  }
  addTextArea(cb) {
    const f = this.controlEl.createEl('textarea');
    const c = {
      setValue: (v) => ((f.value = v), c),
      onChange: (fn) => (f.addEventListener('input', () => fn(f.value)), c),
    };
    cb(c);
    return this;
  }
  addButton(cb) {
    const b = this.controlEl.createEl('button');
    const c = {
      setButtonText: (t) => (b.setText(t), c),
      setCta: () => c,
      setDisabled: (d) => ((b.disabled = d), c),
      onClick: (f) => (b.addEventListener('click', f), c),
    };
    cb(c);
    return this;
  }
}
/** Obsidian's request function: the browser view sends nothing anywhere, so every request fails as unreachable. */
export async function requestUrl() {
  throw new Error('the browser view sends no request');
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
/** Bytes as base64, as Obsidian's own helper writes them: for an image embedded in an export. */
export function arrayBufferToBase64(buffer) {
  let s = '';
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b);
  return btoa(s);
}
/** Where a note's front matter is, as Obsidian finds it: the text between a first line of --- and the next. */
export function getFrontMatterInfo(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)/.exec(text);
  return m
    ? { exists: true, frontmatter: m[1], from: 4, to: 4 + m[1].length, contentStart: m[0].length }
    : { exists: false, frontmatter: '', from: 0, to: 0, contentStart: 0 };
}
/** Enough of YAML for a note's front matter here: `key: value`, `key: [a, b]`, and a key over `- item` lines. */
export function parseYaml(text) {
  const out = {};
  let list = null;
  const scalar = (v) => {
    const t = v.trim().replace(/^(['"])(.*)\1$/, '$2');
    return t === '' ? null : /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s*(.*)$/.exec(line) ?? /^-\s*(.*)$/.exec(line);
    if (item && list) list.push(scalar(item[1]));
    else {
      const kv = /^([^:#]+):\s*(.*)$/.exec(line);
      if (!kv) throw new Error(`cannot read the front matter line: ${line}`);
      const [, key, value] = kv;
      const flow = /^\[(.*)\]$/.exec(value.trim());
      list = value.trim() === '' ? (out[key.trim()] = []) : null;
      if (flow)
        out[key.trim()] = flow[1]
          .split(',')
          .map(scalar)
          .filter((x) => x !== null);
      else if (!list) out[key.trim()] = scalar(value);
    }
  }
  return out;
}
export const Platform = { isMobile: false, isDesktop: true };
/** Obsidian's interface language: the browser's, as the harness runs in one. */
export const getLanguage = () => globalThis.navigator?.language || 'en';
/** Obsidian's Markdown renderer (§18): the browser view has none, so a detail's Markdown is shown as its text. */
export const MarkdownRenderer = {
  render: async (_app, markdown, el) => {
    el.createEl('p', { text: markdown });
  },
};
/** Which modifier opens a link in a new tab: Command or Ctrl, as in Obsidian. */
export const Keymap = { isModEvent: (e) => (e && (e.metaKey || e.ctrlKey) ? 'tab' : false) };
