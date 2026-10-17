// What a screen reader is told of a view (editor spec §41, a11y_semantics_auto): every control's accessible name, role and
// state, read from the view's accessibility tree with axe-core's own reading of it, and the graph's text version held
// against the drawing it describes. Test support only.
import axe from 'axe-core';

/** Everything a person can operate: native controls, ARIA widgets, and anything put in the tab order. */
export const CONTROLS = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  ...[
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
  ].map((r) => `[role="${r}"]`),
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** The roles a control may be read as: a widget, or a group or image that is itself focusable (a box in the drawing). */
const OPERABLE = new Set([
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
  'listbox',
  'textbox',
  'searchbox',
  'treeitem',
  'group',
  'img',
  'graphics-symbol',
  'graphics-object',
  'graphics-document',
  'application',
  'region',
]);

/** The state each role must say, where the element is not a native control that says it itself. */
const STATE_OF = {
  checkbox: 'aria-checked',
  switch: 'aria-checked',
  radio: 'aria-checked',
  menuitemcheckbox: 'aria-checked',
  menuitemradio: 'aria-checked',
  tab: 'aria-selected',
  option: 'aria-selected',
};
const NATIVE = new Set(['input', 'select', 'option', 'textarea', 'button', 'summary', 'a']);
const VALUES = { 'aria-checked': ['true', 'false', 'mixed'], 'aria-selected': ['true', 'false'] };

/** A short name for an element in a report: its tag, its classes and the start of its words. */
const named = (e) => {
  const classes = [...e.classList].slice(0, 3).join('.');
  return `<${e.localName}${classes ? `.${classes}` : ''}> “${e.textContent.trim().slice(0, 30)}”`;
};

/**
 * Every control of the page in `window` a screen reader reaches, as it is read: [{el, name, role, state}]. `state` holds
 * each of pressed, checked, selected and expanded the element says, natively or by ARIA.
 */
export function controlsOf(window) {
  if (!window.axe) window.eval(axe.source);
  const { commons } = window.axe;
  window.axe.setup(window.document);
  try {
    return [...window.document.querySelectorAll(CONTROLS)]
      .filter((el) => commons.dom.isVisibleToScreenReaders(el) && !el.closest('[inert]'))
      .map((el) => {
        const state = {};
        for (const a of ['aria-pressed', 'aria-checked', 'aria-selected', 'aria-expanded'])
          if (el.hasAttribute(a)) state[a.slice(5)] = el.getAttribute(a);
        if (el.localName === 'input' && /^(checkbox|radio)$/.test(el.type)) state.checked = String(el.checked);
        if (el.localName === 'summary') state.expanded = String(!!el.parentElement?.hasAttribute('open'));
        return { el, name: commons.text.accessibleText(el).trim(), role: commons.aria.getRole(el) ?? '', state };
      });
  } finally {
    window.axe.teardown();
  }
}

/** One line for each control in `window` that a screen reader cannot name, place or tell the state of. */
export function treeProblems(window) {
  const problems = [];
  for (const { el, name, role, state } of controlsOf(window)) {
    const what = `${named(el)} (${role || 'no role'})`;
    if (!name) problems.push(`${what}: no accessible name`);
    if (!OPERABLE.has(role)) problems.push(`${what}: read as ${role || 'nothing'}, not as a control`);
    const needs = STATE_OF[role];
    if (needs && !NATIVE.has(el.localName) && !VALUES[needs].includes(el.getAttribute(needs) ?? ''))
      problems.push(`${what}: says no ${needs.slice(5)} state`);
    if (el.hasAttribute('aria-haspopup') && el.getAttribute('aria-haspopup') !== 'false' && !('expanded' in state))
      problems.push(`${what}: opens a popup but says no expanded state`);
  }
  return problems;
}

/**
 * One line for each drawing in `root` whose text version does not match it: the text version is the list the drawing's
 * viewport names as its description. It must count the things drawn, and say of each box what the box is labelled: a box
 * labelled "Type: Name" is a line "Name is a Type.", and a mark after the name (", added by the proposal") is the drawing's.
 */
export function textVersionProblems(root) {
  const problems = [];
  for (const svg of root.querySelectorAll('svg.graph-note-svg')) {
    const holder = svg.closest('[aria-describedby]');
    const described = holder && (root.ownerDocument ?? root).getElementById(holder.getAttribute('aria-describedby'));
    const lines = [...(described ?? root).querySelectorAll('li')].map((li) => li.textContent.trim());
    const summary = lines.map((l) => /^Graph (\S+): (\d+) things?, (\d+) links?\.$/.exec(l)).find(Boolean);
    if (!summary) {
      problems.push(`a drawing with no text version describing it`);
      continue;
    }
    const boxes = [...svg.querySelectorAll('g.node[data-key]')];
    if (Number(summary[2]) < boxes.length)
      problems.push(`graph ${summary[1]}: the text version counts ${summary[2]} things, ${boxes.length} are drawn`);
    for (const box of boxes) {
      const key = box.getAttribute('data-key');
      // a box is labelled "Type: Name", or "Type: Name, mark" when a proposal marks it; the text says "Name is a Type."
      const label = box.getAttribute('aria-label') ?? '';
      const colon = label.indexOf(': ');
      const type = colon > 0 ? label.slice(0, colon) : '';
      const name = colon > 0 ? label.slice(colon + 2) : label || key;
      const names = [name, name.slice(0, Math.max(0, name.lastIndexOf(', ')))].filter(Boolean);
      const says = (l) => names.some((n) => l.startsWith(`${n} is `)) && (!type || l.endsWith(` ${type}.`));
      if (!lines.some(says))
        problems.push(`graph ${summary[1]}: ${key} (“${label}”) is drawn but not in the text version`);
    }
  }
  return problems;
}
