// A stand-in for the obsidian module, enough to load the built plugin in Node: a Plugin that records what it registers,
// Components with the lifecycle and DOM events, Notices, icons and tooltips. Pair it with fake-dom.js.

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
  class TFile {
    constructor(path) {
      this.path = path;
      this.name = path.split('/').pop();
      this.extension = 'md';
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
      return { name, cb };
    },
    offref: (ref) => {
      const i = listeners.indexOf(ref.cb);
      if (i >= 0) listeners.splice(i, 1);
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
  const app = { vault, workspace };
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
      this.containerEl = globalThis.activeDocument.createElement('div');
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
    registerEditorExtension() {}
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
  return {
    Component,
    MarkdownRenderChild,
    Plugin,
    ItemView,
    WorkspaceLeaf,
    TFile,
    Notice,
    setIcon,
    setTooltip,
    Platform,
    app,
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
  const view = {
    EditorView: {
      updateListener: {
        of: (fn) => {
          state.listeners.push(fn);
          return { listener: fn };
        },
      },
    },
  };
  const cmState = { Transaction: { userEvent: { of: (v) => ({ userEvent: v }) } } };
  return { '@codemirror/view': view, '@codemirror/state': cmState };
}
