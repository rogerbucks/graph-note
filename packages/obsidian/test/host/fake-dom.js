// A small stand-in for the browser DOM and Obsidian's element helpers, enough to load the built plugin in Node and see
// what it puts on the page. Not a browser: layout sizes are fixed, and the SVG parser reads only tags and attributes.

export class FakeElement {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.localName = tag;
    this.ownerDocument = doc;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.text = '';
    this.cssProps = {};
    this.focused = false;
    this.captured = new Set();
    this.classList = {
      add: (...c) => {
        const s = this.classSet();
        c.forEach((x) => s.add(x));
        this.setClassSet(s);
      },
      remove: (...c) => {
        const s = this.classSet();
        c.forEach((x) => s.delete(x));
        this.setClassSet(s);
      },
      toggle: (c, on) => {
        const s = this.classSet();
        const v = on ?? !s.has(c);
        if (v) s.add(c);
        else s.delete(c);
        this.setClassSet(s);
        return v;
      },
      contains: (c) => this.classSet().has(c),
    };
  }
  classSet() {
    return new Set((this.attributes.get('class') ?? '').split(/\s+/).filter(Boolean));
  }
  setClassSet(s) {
    if (s.size) this.attributes.set('class', [...s].join(' '));
    else this.attributes.delete('class');
  }
  get className() {
    return this.attributes.get('class') ?? '';
  }
  get id() {
    return this.attributes.get('id') ?? '';
  }
  get textContent() {
    return this.text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(t) {
    this.children = [];
    this.text = String(t);
  }
  // form fields: a value, and a selection in a text field
  get value() {
    if (this.localName === 'select') {
      const o = this.querySelectorAll('option').find((x) => x.hasAttribute('selected')) ?? this.querySelector('option');
      return this._value ?? o?.getAttribute('value') ?? '';
    }
    return this._value ?? this.getAttribute('value') ?? '';
  }
  set value(v) {
    this._value = String(v);
    if (this.selectionStart === undefined || this.selectionStart > this._value.length) {
      this.selectionStart = this.selectionEnd = this._value.length;
    }
  }
  setSelectionRange(a, b) {
    this.selectionStart = a;
    this.selectionEnd = b;
  }
  get disabled() {
    return this.attributes.has('disabled');
  }
  set disabled(v) {
    if (v) this.attributes.set('disabled', '');
    else this.attributes.delete('disabled');
  }
  get hidden() {
    return this.attributes.has('hidden');
  }
  set hidden(v) {
    if (v) this.attributes.set('hidden', '');
    else this.attributes.delete('hidden');
  }
  get clientWidth() {
    return this.ownerDocument.width;
  }
  get clientHeight() {
    return 400;
  }
  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: this.ownerDocument.width,
      height: 400,
      right: this.ownerDocument.width,
      bottom: 400,
    };
  }
  getAttribute(n) {
    return this.attributes.has(n) ? this.attributes.get(n) : null;
  }
  setAttribute(n, v) {
    this.attributes.set(n, String(v));
  }
  removeAttribute(n) {
    this.attributes.delete(n);
  }
  hasAttribute(n) {
    return this.attributes.has(n);
  }
  appendChild(c) {
    if (c.parentElement) c.remove();
    c.parentElement = this;
    this.children.push(c);
    childAdded(this);
    return c;
  }
  append(...cs) {
    cs.forEach((c) => (typeof c === 'string' ? this.appendText(c) : this.appendChild(c)));
  }
  prepend(c) {
    if (c.parentElement) c.remove();
    c.parentElement = this;
    this.children.unshift(c);
    childAdded(this);
  }
  insertBefore(c, ref) {
    if (!ref) return this.appendChild(c);
    if (c.parentElement) c.remove();
    c.parentElement = this;
    this.children.splice(this.children.indexOf(ref), 0, c);
    childAdded(this);
    return c;
  }
  replaceChildren(...cs) {
    for (const c of this.children) c.parentElement = null; // as in a browser, the old children leave the page
    this.children = [];
    this.text = '';
    this.append(...cs);
  }
  remove() {
    // as in Chromium (seen 9 Oct 2026): an element taken off the page loses the focus, saying so while still on it, and
    // does not have it back when put back
    const lost = this.ownerDocument.activeElement;
    if (this.contains(lost)) {
      this.ownerDocument.activeElement = null;
      lost.dispatch('blur');
      lost.dispatch('focusout');
    }
    const p = this.parentElement;
    if (p) {
      p.children = p.children.filter((x) => x !== this);
      this.parentElement = null;
    }
    // and, as in a browser, what leaves the page loses its scroll
    const lose = (e) => {
      if (e.scrollTop) e.scrollTop = 0;
      if (e.scrollLeft) e.scrollLeft = 0;
      e.children.forEach(lose);
    };
    lose(this);
  }
  contains(o) {
    for (let e = o; e; e = e.parentElement) if (e === this) return true;
    return false;
  }
  cloneNode() {
    throw new Error('not in the fake DOM');
  }
  get isConnected() {
    let e = this;
    while (e.parentElement) e = e.parentElement;
    return e === this.ownerDocument.body || e === this.ownerDocument.documentElement;
  }
  matches(sel) {
    return sel.split(',').some((one) => matchChain(this, one.trim().split(/\s+(?![^[]*\])/)));
  }
  closest(sel) {
    for (let e = this; e; e = e.parentElement) if (e.matches?.(sel)) return e;
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = (e) => {
      for (const c of e.children) {
        if (c.matches(sel)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  addEventListener(type, fn) {
    (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((f) => f !== fn),
    );
  }
  dispatch(type, init = {}) {
    const ev = {
      type,
      target: init.target ?? this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {},
      ...init,
    };
    for (let e = ev.target; e; e = e.parentElement) for (const fn of e.listeners.get(type) ?? []) fn.call(e, ev);
    // and on to the document, from anything on the page
    const doc = this.ownerDocument;
    if (ev.target.isConnected) for (const fn of doc.listeners?.get(type) ?? []) fn.call(doc, ev);
    return ev;
  }
  click() {
    return this.dispatch('click');
  }
  focus(options) {
    // as in a browser: an element that is not on the page cannot take the focus; one that does says so, as does the one
    // that had it; and, unless told preventScroll, the page scrolls to show it (counted, as the fake has no layout)
    const doc = this.ownerDocument,
      had = doc.activeElement;
    if (!this.isConnected || had === this) return;
    if (!options?.preventScroll) doc.scrolledToFocus = (doc.scrolledToFocus ?? 0) + 1;
    doc.activeElement = this;
    // and, as in a browser, each event names the element the focus is going to, or coming from, as its relatedTarget
    if (had) {
      had.dispatch('blur', { relatedTarget: this });
      had.dispatch('focusout', { relatedTarget: this });
    }
    this.dispatch('focus', { relatedTarget: had });
    this.dispatch('focusin', { relatedTarget: had });
  }
  blur() {
    if (this.ownerDocument.activeElement !== this) return;
    this.ownerDocument.activeElement = null;
    this.dispatch('blur');
    this.dispatch('focusout');
  }
  setPointerCapture(id) {
    this.captured.add(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  // Obsidian's helpers on HTMLElement
  createEl(tag, o = {}, cb) {
    const e = new FakeElement(tag, this.ownerDocument);
    applyInfo(e, o);
    this.appendChild(e);
    cb?.(e);
    return e;
  }
  createDiv(o = {}, cb) {
    return this.createEl('div', typeof o === 'string' ? { cls: o } : o, cb);
  }
  createSpan(o = {}, cb) {
    return this.createEl('span', typeof o === 'string' ? { cls: o } : o, cb);
  }
  createSvg(tag, o = {}) {
    return this.createEl(tag, o);
  }
  appendText(t) {
    const e = new FakeElement('#text', this.ownerDocument);
    e.text = t;
    this.appendChild(e);
  }
  setText(t) {
    this.textContent = t;
  }
  empty() {
    const a = this.ownerDocument.activeElement;
    if (a && a !== this && this.contains(a)) this.ownerDocument.activeElement = null;
    for (const c of this.children) c.parentElement = null;
    this.children = [];
    this.text = '';
  }
  addClass(...c) {
    this.classList.add(...c);
  }
  removeClass(...c) {
    this.classList.remove(...c);
  }
  toggleClass(c, on) {
    this.classList.toggle(c, on);
  }
  hasClass(c) {
    return this.classList.contains(c);
  }
  setAttr(n, v) {
    if (v === null) this.removeAttribute(n);
    else this.setAttribute(n, v);
  }
  setCssProps(p) {
    Object.assign(this.cssProps, p);
  }
  setCssStyles(p) {
    Object.assign(this.cssProps, p);
  }
  show() {
    this.hidden = false;
  }
  hide() {
    this.hidden = true;
  }
  get doc() {
    return this.ownerDocument;
  }
  get win() {
    return this.ownerDocument.defaultView;
  }
}

function applyInfo(e, o) {
  if (o.cls) e.addClass(...(Array.isArray(o.cls) ? o.cls : o.cls.split(' ')));
  if (o.text !== undefined) e.text = String(o.text);
  for (const [k, v] of Object.entries(o.attr ?? {}))
    if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
  if (o.title) e.setAttribute('title', o.title);
  if (o.type) e.setAttribute('type', o.type);
}

/** A selector of parts joined by spaces: the last matches the element, each earlier one some ancestor, in order. */
function matchChain(e, parts) {
  if (!matchOne(e, parts[parts.length - 1])) return false;
  let rest = parts.slice(0, -1);
  for (let a = e.parentElement; a && rest.length; a = a.parentElement)
    if (matchOne(a, rest[rest.length - 1])) rest = rest.slice(0, -1);
  return rest.length === 0;
}

function matchOne(e, sel) {
  if (e.tagName === '#TEXT') return false;
  const m = /^([a-zA-Z0-9-]*)(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(sel);
  if (!m) throw new Error(`the fake DOM cannot match ${sel}`);
  const [, tag, id, classes, attrs] = m;
  if (tag && e.localName !== tag) return false;
  if (id && e.getAttribute('id') !== id.slice(1)) return false;
  for (const c of classes.split('.').filter(Boolean)) if (!e.classList.contains(c)) return false;
  for (const a of attrs.match(/\[[^\]]+\]/g) ?? []) {
    const [, n, v] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(a);
    if (!e.hasAttribute(n) || (v !== undefined && e.getAttribute(n) !== v)) return false;
  }
  return true;
}

/** Reads SVG text into fake elements: tags and attributes, and text inside elements. Enough to find boxes and links. */
function parseXml(text, doc) {
  const root = new FakeElement('#root', doc),
    stack = [root];
  const re = /<(\/?)([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(text));) {
    const [, close, tag, attrs, self, chars] = m;
    const top = stack[stack.length - 1];
    if (chars !== undefined) {
      if (chars.trim()) top.appendText(chars);
      continue;
    }
    if (close) {
      stack.pop();
      continue;
    }
    const e = new FakeElement(tag, doc);
    for (const a of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) e.setAttribute(a[1], a[2]);
    top.appendChild(e);
    if (!self) stack.push(e);
  }
  return root.children[0];
}

/**
 * A child was put into `parent`: as a browser does, each MutationObserver watching the document hears of it once, on a
 * microtask, however many children were put in meanwhile. Only what is on the page counts, as with observing the
 * document's root with subtree.
 */
function childAdded(parent) {
  const doc = parent.ownerDocument;
  if (!doc.mutationObservers?.size || !parent.isConnected || doc.mutationPending) return;
  doc.mutationPending = true;
  queueMicrotask(() => {
    doc.mutationPending = false;
    for (const o of [...doc.mutationObservers]) o.callback([{ type: 'childList' }], o);
  });
}

export function fakeDocument(width = 700) {
  const doc = { width, activeElement: null };
  doc.body = new FakeElement('body', doc);
  doc.documentElement = doc.body;
  doc.createElement = (t) => new FakeElement(t, doc);
  doc.createElementNS = (_ns, t) => new FakeElement(t, doc);
  doc.importNode = (n) => n;
  doc.adoptNode = (n) => n;
  doc.listeners = new Map();
  doc.addEventListener = (type, fn) => (doc.listeners.get(type) ?? doc.listeners.set(type, []).get(type)).push(fn);
  doc.removeEventListener = (type, fn) =>
    doc.listeners.set(
      type,
      (doc.listeners.get(type) ?? []).filter((f) => f !== fn),
    );
  doc.defaultView = {
    innerHeight: 800,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (f) => setTimeout(f, 0),
    cancelAnimationFrame: clearTimeout,
    // Obsidian's helpers on the window: an element not yet on the page
    createDiv: (o = {}) => {
      const e = new FakeElement('div', doc);
      applyInfo(e, typeof o === 'string' ? { cls: o } : o);
      return e;
    },
  };
  return doc;
}

/** Installs the fake DOM as the globals the plugin reads. Returns a function that removes them. */
export function installGlobals(doc) {
  const saved = {};
  const set = (k, v) => {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  };
  set('activeDocument', doc);
  set('document', doc);
  set('activeWindow', doc.defaultView);
  set('window', doc.defaultView);
  set('createDiv', doc.defaultView.createDiv);
  set(
    'DOMParser',
    class {
      parseFromString(t) {
        const el = parseXml(t, doc);
        return { documentElement: el, querySelector: (s) => (el.matches(s) ? el : el.querySelector(s)) };
      }
    },
  );
  set(
    'ResizeObserver',
    class {
      constructor(cb) {
        this.cb = cb;
      }
      observe() {
        doc.observers = (doc.observers ?? []).concat(this);
      }
      disconnect() {}
      unobserve() {}
    },
  );
  set(
    'MutationObserver',
    class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        (doc.mutationObservers ??= new Set()).add(this);
      }
      disconnect() {
        doc.mutationObservers?.delete(this);
      }
      takeRecords() {
        return [];
      }
    },
  );
  set('HTMLElement', FakeElement);
  set('Element', FakeElement);
  set('SVGElement', FakeElement);
  set('navigator', {
    clipboard: {
      writeText: async (t) => {
        doc.clipboard = t;
      },
    },
  });
  return () => {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  };
}
