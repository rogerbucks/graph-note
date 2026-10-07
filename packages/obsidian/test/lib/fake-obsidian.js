// A stand-in for the obsidian module, enough to load the built plugin in Node: a Plugin that records what it registers,
// Components with the lifecycle and DOM events, Notices, icons and tooltips. Pair it with fake-dom.js.

export function fakeObsidian(state = {}) {
  state.notices = []; state.processors = new Map(); state.taken = state.taken ?? new Set(); state.icons = [];
  class Component {
    constructor() { this._children = []; this._cleanups = []; this._loaded = false; }
    load() { this._loaded = true; this.onload?.(); this._children.forEach((c) => c.load()); }
    unload() { this._children.forEach((c) => c.unload()); this._cleanups.splice(0).forEach((f) => f()); this._loaded = false; this.onunload?.(); }
    addChild(c) { this._children.push(c); if (this._loaded) c.load(); return c; }
    removeChild(c) { this._children = this._children.filter((x) => x !== c); c.unload(); return c; }
    register(f) { this._cleanups.push(f); }
    registerDomEvent(el, type, fn, opts) { el.addEventListener(type, fn, opts); this._cleanups.push(() => el.removeEventListener(type, fn)); }
    registerEvent() {}
    registerInterval(id) { return id; }
  }
  class MarkdownRenderChild extends Component { constructor(containerEl) { super(); this.containerEl = containerEl; } }
  class Plugin extends Component {
    constructor(app, manifest) { super(); this.app = app ?? { workspace: {} }; this.manifest = manifest ?? { id: 'graph-note' }; }
    registerMarkdownCodeBlockProcessor(lang, fn) {
      if (state.taken.has(lang) || state.processors.has(lang)) throw new Error(`Code block postprocessor for language ${lang} is already registered`);
      state.processors.set(lang, fn);
    }
    registerView() {}
    addCommand(c) { (state.commands ??= []).push(c); return c; }
    registerEditorExtension() {}
  }
  class Notice { constructor(message) { state.notices.push(String(message)); } hide() {} setMessage() { return this; } }
  const setIcon = (el, icon) => { el.setAttribute('data-icon', icon); state.icons.push(icon); };
  const setTooltip = (el, tip) => el.setAttribute('data-tooltip', tip);
  const Platform = { isMobile: !!state.mobile, isPhone: !!state.mobile, isDesktop: !state.mobile, isDesktopApp: !state.mobile };
  return { Component, MarkdownRenderChild, Plugin, Notice, setIcon, setTooltip, Platform };
}

/** What Obsidian hands a code block processor: the note text and the lines of this block, and a place for children. */
export function fakeContext(note, fenceLine, children = []) {
  const lines = note.split('\n');
  let end = fenceLine + 1;
  while (end < lines.length && !/^\s*(```|~~~)/.test(lines[end])) end++;
  return {
    sourcePath: 'Some note.md', docId: 'x', frontmatter: {},
    getSectionInfo: () => (fenceLine < 0 ? null : { text: note, lineStart: fenceLine, lineEnd: end }),
    addChild: (c) => { children.push(c); c.load(); },
    children,
  };
}
