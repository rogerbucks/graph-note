// A keyboard-only run of a page (editor spec §41, a11y_keyboard_auto):
// - Tab and Shift+Tab walk through it as a browser moves the focus.
// - Every action is reached.
// - Each action the page draws itself is operated with Enter or Space.
// - Every dialog of ours is left with Escape.
// It runs on either DOM the tests use, jsdom and the Obsidian host's fake DOM, with the page's own key handlers live.
// Neither moves the focus on Tab by itself. So the run does what a browser does when a handler leaves the key alone.
// The focus then goes to the next element in the tab order. Test support only.

/** What can take the focus at all, before the checks of each element below. */
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';
/** Controls a browser operates by itself from the keyboard: Enter or Space on them clicks them. */
const NATIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);
/** The roles of an action: what a person operates, as against a region or drawing that only takes the focus. */
const ACTION_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'switch',
  'radio',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'slider',
  'spinbutton',
  'combobox',
  'textbox',
  'searchbox',
  'treeitem',
]);
/** The widgets whose members are reached with the arrow keys from the one member in the tab order. */
const COMPOSITE = ['menu', 'menubar', 'listbox', 'tablist', 'radiogroup', 'tree', 'grid', 'treegrid', 'toolbar']
  .map((r) => `[role="${r}"]`)
  .join(', ');
/** Dialogs Obsidian draws, which it keeps the focus in and closes on Escape itself: not this plugin's to do. */
const HOST_DIALOG = '.modal';

/** An element's classes (the fake DOM's class list cannot be walked). */
const classesOf = (e) => (e.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

/** A short name for an element in a report: its tag, its classes, and its label or the start of its words. */
export function named(e) {
  const classes = classesOf(e).slice(0, 3).join('.');
  const words = (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30);
  return `<${e.localName}${classes ? `.${classes}` : ''}> “${words}”`;
}

const isJsdom = (doc) => typeof doc.defaultView?.KeyboardEvent === 'function';

/** Whether `e` is drawn: not hidden, not inert, not in a closed disclosure, and, in jsdom, not styled away. */
function shown(doc, e) {
  if (e.closest('[hidden]') || e.closest('[inert]')) return false;
  const details = e.closest('details');
  if (details && !details.hasAttribute('open') && !(e.localName === 'summary' && e.parentElement === details))
    return false;
  if (isJsdom(doc))
    for (let a = e; a && a !== doc.body; a = a.parentElement) {
      const style = doc.defaultView.getComputedStyle(a);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
  return true;
}

/** Whether `e` takes the focus: shown, not disabled, and not a hidden input. */
function focusable(doc, e) {
  if (e.hasAttribute('disabled') || (e.localName === 'input' && e.getAttribute('type') === 'hidden')) return false;
  if (e.localName === 'a' && !e.hasAttribute('href') && !e.hasAttribute('tabindex')) return false;
  return shown(doc, e);
}

const tabIndex = (e) => (e.hasAttribute('tabindex') ? Number(e.getAttribute('tabindex')) : 0);

/** Every element of the page in its tab order: document order, as every tab index here is 0 or -1. */
export function tabOrder(doc) {
  return [...doc.body.querySelectorAll(FOCUSABLE)].filter((e) => focusable(doc, e) && tabIndex(e) >= 0);
}

/** The role an element is read as: its own, or the one its tag gives it. */
function roleOf(e) {
  const own = e.getAttribute('role');
  if (own) return own.split(/\s+/)[0];
  if (e.localName === 'a') return 'link';
  if (e.localName === 'input')
    return /^(checkbox|radio)$/.test(e.getAttribute('type') ?? '') ? e.getAttribute('type') : 'textbox';
  return { button: 'button', select: 'combobox', textarea: 'textbox', summary: 'button' }[e.localName] ?? '';
}

/** Every action of the page a person can operate: the native controls and the elements with an action's role. */
export function actions(doc) {
  const all = [
    ...doc.body.querySelectorAll(`${FOCUSABLE}, ${[...ACTION_ROLES].map((r) => `[role="${r}"]`).join(', ')}`),
  ];
  return all.filter((e) => focusable(doc, e) && (NATIVE.has(e.localName) || ACTION_ROLES.has(roleOf(e))));
}

/** Presses `key` on what has the focus (or the page), as a key press is sent: true when a handler took it. */
export function press(doc, key, shiftKey = false) {
  const target = doc.activeElement && doc.activeElement !== doc.documentElement ? doc.activeElement : doc.body;
  if (isJsdom(doc)) {
    const ev = new doc.defaultView.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  }
  return target.dispatch('keydown', { key, shiftKey }).defaultPrevented;
}

/** Every element under `root`, in document order (the fake DOM's selectors have no `*`). */
function inOrder(root) {
  const out = [];
  const walk = (e) => {
    for (const c of e.children) if (c.localName && c.tagName !== '#TEXT') (out.push(c), walk(c));
  };
  walk(root);
  return out;
}

/** Tab (or Shift+Tab): sent to the page, and where no handler took it, the focus moved on as a browser moves it. */
export function tab(doc, back = false) {
  if (press(doc, 'Tab', back)) return;
  const order = tabOrder(doc);
  if (!order.length) return;
  const at = doc.activeElement;
  const all = inOrder(doc.body);
  const here = order.includes(at) ? order.indexOf(at) : -1;
  let next;
  if (here >= 0) next = order[(here + (back ? -1 : 1) + order.length) % order.length];
  else {
    // from outside the order (the page itself, or an element out of it): the next one after it in the document
    const from = at && all.includes(at) ? all.indexOf(at) : back ? all.length : -1;
    const after = order.filter((e) => (back ? all.indexOf(e) < from : all.indexOf(e) > from));
    next = back ? (after.at(-1) ?? order.at(-1)) : (after[0] ?? order[0]);
  }
  next.focus();
}

/** The dialog of ours that is open on top, if one is: it keeps the focus while open. */
function openDialog(doc) {
  return (
    [...doc.body.querySelectorAll('[aria-modal="true"]')]
      .filter((d) => shown(doc, d) && !d.closest(HOST_DIALOG))
      .at(-1) ?? null
  );
}

/**
 * Walks the page with Tab, then with Shift+Tab, round the whole tab order. It gives one line for each of these:
 * - an element of the order the walk never reaches;
 * - an element that keeps the focus (Tab, and Escape then Tab, both leave it there);
 * - a press that takes the focus out of an open dialog.
 */
export function walkProblems(doc) {
  const problems = [];
  for (const back of [false, true]) {
    const way = back ? 'Shift+Tab' : 'Tab';
    const dialog = openDialog(doc);
    const scope = (e) => !dialog || dialog.contains(e);
    if (dialog && !dialog.contains(doc.activeElement)) {
      problems.push(`${named(dialog)}: the dialog is open, and the focus is not in it`);
      tabOrder(doc).find(scope)?.focus();
    }
    const seen = new Set();
    const limit = 2 * tabOrder(doc).length + 4;
    for (let i = 0; i < limit; i++) {
      const before = doc.activeElement;
      tab(doc, back);
      let now = doc.activeElement;
      if (now === before && tabOrder(doc).filter(scope).length > 1) {
        // a field may take Tab for itself (a suggestion taken): Escape puts its help away, and Tab then leaves
        press(doc, 'Escape');
        tab(doc, back);
        now = doc.activeElement;
        if (now === before) {
          problems.push(`${named(now)}: ${way} leaves the focus here, and Escape then ${way} too`);
          break;
        }
      }
      if (dialog && !dialog.contains(now)) {
        problems.push(`${named(dialog)}: ${way} takes the focus out of the open dialog, to ${named(now)}`);
        break;
      }
      seen.add(now);
    }
    for (const e of tabOrder(doc).filter(scope))
      if (!seen.has(e)) problems.push(`${named(e)}: ${way} never reaches it`);
  }
  return [...new Set(problems)];
}

/** One line for each action out of the tab order that the arrow keys cannot reach either: in no composite widget. */
export function unreachedProblems(doc) {
  return actions(doc)
    .filter((e) => tabIndex(e) < 0)
    .filter((e) => {
      const group = e.closest(COMPOSITE);
      return !group || !tabOrder(doc).some((m) => group.contains(m));
    })
    .map((e) => `${named(e)}: out of the tab order, and in no widget whose arrow keys reach it`);
}

/** The kind of an action, for operating one of each: its tag, role and classes. */
export const kindOf = (e) => `${e.localName}|${roleOf(e)}|${classesOf(e).sort().join('.')}`;

/** The actions the page draws itself (no browser operates them): one of each kind, in document order. */
export function ownActionKinds(doc) {
  const kinds = new Map();
  for (const e of actions(doc)) if (!NATIVE.has(e.localName) && !kinds.has(kindOf(e))) kinds.set(kindOf(e), e);
  return [...kinds.keys()];
}

/**
 * Operates the first action of `kind` from the keyboard: focused, then Enter, then, if Enter did nothing, Space. A
 * problem line when neither did anything: no handler took the key, and the page and the focus stayed as they were.
 * `snapshot` is the page as text, to see that something happened.
 */
export function operateProblem(doc, kind, snapshot) {
  const e = actions(doc).find((a) => kindOf(a) === kind);
  if (!e) return `${kind}: no such action to operate`;
  e.focus();
  for (const key of ['Enter', ' ']) {
    const before = snapshot();
    const took = press(doc, key);
    if (took || snapshot() !== before || doc.activeElement !== e) return null;
  }
  return `${named(e)}: neither Enter nor Space operates it`;
}

/** One line for each dialog of ours that Escape, pressed on any element in it, does not leave. `reopen` opens it again. */
export async function escapeProblems(doc, reopen) {
  const problems = [];
  const first = openDialog(doc);
  if (!first) return problems;
  const count = tabOrder(doc).filter((e) => first.contains(e)).length;
  for (let i = 0; i < count; i++) {
    const page = i === 0 ? doc : await reopen();
    const dialog = openDialog(page);
    const e = tabOrder(page).filter((x) => dialog.contains(x))[i];
    e.focus();
    // a field may take the first Escape for itself (its suggestions, or what it was typing); the second is the dialog's
    press(page, 'Escape');
    if (dialog.isConnected && shown(page, dialog)) press(page, 'Escape');
    if (dialog.isConnected && shown(page, dialog))
      problems.push(`${named(e)}: Escape does not leave the dialog from here`);
    else if (dialog.contains(page.activeElement) || !page.activeElement || page.activeElement === page.body)
      problems.push(`${named(e)}: the dialog closed, and the focus went nowhere`);
  }
  return problems;
}

/** Every problem of the keyboard run of one view, reopened by `reopen()` for each action and dialog it operates. */
export async function runProblems(reopen, docOf, snapshotOf, close) {
  const first = await reopen();
  const doc = docOf(first);
  // the kinds as drawn, before the walk marks what it focuses
  const kinds = ownActionKinds(doc);
  const problems = [...walkProblems(doc), ...unreachedProblems(doc)];
  close(first);
  for (const kind of kinds) {
    const view = await reopen();
    try {
      const problem = operateProblem(docOf(view), kind, () => snapshotOf(view));
      if (problem) problems.push(problem);
    } finally {
      close(view);
    }
  }
  const opened = [];
  const again = async () => {
    const view = await reopen();
    opened.push(view);
    return docOf(view);
  };
  try {
    problems.push(...(await escapeProblems(await again(), again)));
  } finally {
    opened.forEach(close);
  }
  return problems;
}
