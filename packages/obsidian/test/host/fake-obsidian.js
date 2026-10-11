// A stand-in for the obsidian module, enough to load the built plugin in Node: a Plugin that records what it registers,
// Components with the lifecycle and DOM events, Notices, icons and tooltips. Pair it with fake-dom.js.
import { createRequire } from 'node:module';
import { fakeSettings } from './fake-settings.js';
import { addVaultWrites, fakeFileManager, fakeMetadataCache, getFrontMatterInfo, parseYaml } from './fake-vault.js';

// the CommonJS copies of CodeMirror, as the built plugin requires them: one copy, so its fields and facets are known
const require = createRequire(import.meta.url);
const cmState = require('@codemirror/state');
const cmView = require('@codemirror/view');
/** Obsidian's own editor fields: whether an editor is in Live Preview, and which file it shows. */
const editorLivePreviewField = cmState.StateField.define({ create: () => true, update: (v) => v });
const editorInfoField = cmState.StateField.define({ create: () => ({ file: null }), update: (v) => v });
export { cmState, cmView, editorLivePreviewField, editorInfoField };

export function fakeObsidian(state = {}) {
  state.notices = [];
  state.processors = new Map();
  state.taken = state.taken ?? new Set();
  state.icons = [];
  class Component {
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
      this._loaded = false;
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
      this._cleanups.push(() => el.removeEventListener(type, fn));
    }
    registerEvent() {}
    registerInterval(id) {
      return id;
    }
  }
  class MarkdownRenderChild extends Component {
    constructor(containerEl) {
      super();
      this.containerEl = containerEl;
    }
  }
  // A vault of notes by path, which reports changes as Obsidian's does; and a workspace whose leaves hold views.
  const files = state.files ?? (state.files = new Map());
  const listeners = [];
  // who hears a note renamed (told the file at its new path, and its old path) or deleted, as Obsidian's vault tells them
  const heard = { rename: [], delete: [] };
  state.tell = (name, ...args) => [...heard[name]].forEach((l) => l(...args));
  class TFile {
    constructor(path) {
      this.path = path;
      this.name = path.split('/').pop();
      this.extension = path.split('.').pop() ?? 'md';
    }
  }
  const file = (path) => (files.has(path) ? new TFile(path) : null);
  const vault = {
    getFileByPath: file,
    getAbstractFileByPath: file,
    getMarkdownFiles: () => [...files.keys()].filter((p) => p.endsWith('.md')).map((p) => new TFile(p)),
    read: async (f) => files.get(f.path),
    cachedRead: async (f) => files.get(f.path),
    process: async (f, fn) => {
      const next = fn(files.get(f.path));
      if (next !== files.get(f.path)) {
        files.set(f.path, next);
        (state.writes ??= []).push(f.path);
        listeners.forEach((l) => l(file(f.path)));
      }
      return next;
    },
    modify: async (f, text) => {
      files.set(f.path, text);
      listeners.forEach((l) => l(file(f.path)));
    },
    on: (name, cb) => {
      if (name === 'modify') listeners.push(cb);
      else heard[name]?.push(cb);
      return { name, cb };
    },
    offref: (ref) => {
      for (const l of [listeners, ...Object.values(heard)]) {
        const i = l.indexOf(ref.cb);
        if (i >= 0) l.splice(i, 1);
      }
    },
  };
  const leaves = [];
  const workspace = {
    leaves,
    getLeaf: (how) => {
      const leaf = new WorkspaceLeaf(app, how);
      leaves.push(leaf);
      return leaf;
    },
    getLeavesOfType: (type) => leaves.filter((l) => l.view?.getViewType() === type),
    revealLeaf: async (leaf) => {
      state.revealed = leaf;
    },
    detachLeavesOfType: (type) => {
      for (const l of leaves.filter((x) => x.view?.getViewType() === type)) l.detach();
    },
    on: () => ({}),
    offref: () => {},
  };
  // the note in front, by its path in state.active
  workspace.getActiveFile = () => file(state.active ?? '');
  addVaultWrites(vault, state, file);
  const app = { vault, workspace, metadataCache: fakeMetadataCache(state), fileManager: fakeFileManager(state) };
  const settings = fakeSettings(state, app);
  class WorkspaceLeaf {
    constructor(app_, how) {
      this.app = app_;
      this.how = how;
      this.view = null;
    }
    async setViewState({ type, state: viewState }) {
      const factory = state.views.get(type);
      if (!factory) throw new Error(`no view ${type}`);
      if (!this.view || this.view.getViewType() !== type) {
        this.view = factory(this);
        this.view.load();
        await this.view.onOpen?.();
      }
      await this.view.setState?.(viewState ?? {}, {});
    }
    getViewState() {
      return { type: this.view?.getViewType(), state: this.view?.getState?.() };
    }
    detach() {
      this.view?.onClose?.();
      this.view?.unload();
      const i = leaves.indexOf(this);
      if (i >= 0) leaves.splice(i, 1);
      this.view = null;
    }
  }
  class ItemView extends Component {
    constructor(leaf) {
      super();
      this.leaf = leaf;
      this.app = leaf.app;
      // a view is on the page, as a workspace leaf is
      this.containerEl = globalThis.activeDocument.body.createDiv();
      this.containerEl.createDiv({ cls: 'view-header' });
      this.contentEl = this.containerEl.createDiv({ cls: 'view-content' });
    }
    getState() {
      return {};
    }
    async setState() {}
    addAction(icon, title, cb) {
      const b = this.containerEl.children[0].createEl('button', { attr: { 'aria-label': title } });
      b.addEventListener('click', cb);
      return b;
    }
  }
  state.views = new Map();
  state.data = state.data ?? null;
  class Plugin extends Component {
    constructor(app_, manifest) {
      super();
      this.app = app_ ?? app;
      this.manifest = manifest ?? { id: 'graph-note' };
    }
    registerView(type, factory) {
      state.views.set(type, factory);
    }
    async loadData() {
      return state.data === null ? null : JSON.parse(JSON.stringify(state.data));
    }
    async saveData(d) {
      state.data = JSON.parse(JSON.stringify(d));
    }
    registerMarkdownCodeBlockProcessor(lang, fn) {
      if (state.taken.has(lang) || state.processors.has(lang))
        throw new Error(`Code block postprocessor for language ${lang} is already registered`);
      state.processors.set(lang, fn);
    }
    addCommand(c) {
      (state.commands ??= []).push(c);
      return c;
    }
    registerEditorExtension(ext) {
      (state.editorExtensions ??= []).push(ext);
    }
    addSettingTab(tab) {
      state.settingTabs.push(tab);
    }
  }
  class Notice {
    constructor(message) {
      state.notices.push(String(message));
    }
    hide() {}
    setMessage() {
      return this;
    }
  }
  // A menu, as Obsidian shows one from a button: each item with its title, icon and tick, recorded when it is shown.
  state.menus = [];
  class Menu {
    constructor() {
      this.items = [];
    }
    addItem(build) {
      const item = {
        title: '',
        icon: '',
        checked: false,
        setTitle(t) {
          item.title = String(t);
          return item;
        },
        setIcon(i) {
          item.icon = i;
          return item;
        },
        setChecked(c) {
          item.checked = !!c;
          return item;
        },
        setSection() {
          return item;
        },
        setWarning() {
          return item;
        },
        onClick(f) {
          item.click = () => f({});
          return item;
        },
        click() {},
      };
      build(item);
      this.items.push(item);
      return this;
    }
    addSeparator() {
      return this;
    }
    showAtMouseEvent() {
      state.menus.push(this);
      return this;
    }
    showAtPosition(position, doc) {
      this.shownAt = position;
      this.shownIn = doc;
      state.menus.push(this);
      return this;
    }
    hide() {
      return this;
    }
  }
  const setIcon = (el, icon) => {
    el.setAttribute('data-icon', icon);
    state.icons.push(icon);
  };
  const setTooltip = (el, tip) => el.setAttribute('data-tooltip', tip);
  const Platform = {
    isMobile: !!state.mobile,
    isPhone: !!state.mobile,
    isDesktop: !state.mobile,
    isDesktopApp: !state.mobile,
  };
  /** A note open in an editor: its mode, and an Editor over a text, as Obsidian's MarkdownView has. */
  class MarkdownView {
    constructor(file, text, mode = 'source') {
      this.file = file;
      this.mode = mode;
      this.text = text;
      this.transactions = [];
      const view = this;
      const pos = (offset) => {
        const before = view.text.slice(0, offset).split('\n');
        return { line: before.length - 1, ch: before[before.length - 1].length };
      };
      const offset = (p) =>
        view.text
          .split('\n')
          .slice(0, p.line)
          .reduce((a, l) => a + l.length + 1, 0) + p.ch;
      this.editor = {
        getValue: () => view.text,
        offsetToPos: pos,
        posToOffset: offset,
        transaction: (tx) => {
          view.transactions.push(tx);
          for (const c of [...(tx.changes ?? [])].sort((a, b) => offset(b.from) - offset(a.from)))
            view.text = view.text.slice(0, offset(c.from)) + c.text + view.text.slice(offset(c.to ?? c.from));
        },
      };
    }
    getViewType() {
      return 'markdown';
    }
    getMode() {
      return this.mode;
    }
  }
  return {
    Component,
    MarkdownRenderChild,
    MarkdownView,
    editorLivePreviewField,
    editorInfoField,
    Plugin,
    ItemView,
    WorkspaceLeaf,
    TFile,
    Notice,
    Menu,
    setIcon,
    setTooltip,
    Platform,
    app,
    ...settings,
    parseYaml,
    getFrontMatterInfo,
  };
}

/** What Obsidian hands a code block processor: the note text and the lines of this block, and a place for children. */
export function fakeContext(note, fenceLine, children = []) {
  const lines = note.split('\n');
  let end = fenceLine + 1;
  while (end < lines.length && !/^\s*(```|~~~)/.test(lines[end])) end++;
  return {
    sourcePath: 'Some note.md',
    docId: 'x',
    frontmatter: {},
    getSectionInfo: () => (fenceLine < 0 ? null : { text: note, lineStart: fenceLine, lineEnd: end }),
    addChild: (c) => {
      children.push(c);
      c.load();
    },
    children,
  };
}

/** Stand-ins for the CodeMirror modules Obsidian supplies at run time: enough to load the plugin and drive its editor hooks. */
export function fakeCodeMirror(state = {}) {
  state.listeners = [];
  // the real modules, with the editor's update listener caught, so a test can drive what the plugin hears
  class EditorView extends cmView.EditorView {}
  Object.defineProperty(EditorView, 'updateListener', {
    value: {
      of: (fn) => {
        state.listeners.push(fn);
        return { listener: fn };
      },
    },
  });
  return { '@codemirror/view': { ...cmView, EditorView }, '@codemirror/state': cmState };
}
