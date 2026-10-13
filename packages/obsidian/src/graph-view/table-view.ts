// A graph drawn as a table (spec §15, diagram_type_set): a plain table the plugin draws, never Graphviz — a row for each
// thing, with its kind and properties, and one for each link — from the core's `tableOf`. Each row is reached and named as
// a box or a link of a drawing is, so tapping, the details and the inspector work as in every other type
// (type_one_way_to_work); the card zooms it by the same buttons and gestures, scaling it as a whole.
import type { DiagramTable } from '@graph-note/core';

/** Roughly how wide one character of the table is, and how tall a row, in CSS pixels: its size before it is on the page. */
const CHAR_PX = 7.5,
  ROW_PX = 30,
  CELL_PAD_PX = 20,
  WIDEST_CHARS = 40;

/** The table's natural size, estimated from its words, for the card's zoom to fit before the table is on the page. */
export function tableSize(t: DiagramTable): { width: number; height: number } {
  const across = (rows: string[][]) =>
    (rows[0] ?? []).reduce(
      (w, _, i) =>
        w + Math.min(WIDEST_CHARS, Math.max(...rows.map((r) => (r[i] ?? '').length))) * CHAR_PX + CELL_PAD_PX,
      0,
    );
  const links = [['From', 'Link', 'To', 'Properties'], ...t.links.map((l) => [...l.cells, l.properties])];
  return {
    width: Math.ceil(Math.max(across([t.columns, ...t.rows.map((r) => r.cells)]), t.links.length ? across(links) : 0)),
    height: (t.rows.length + 2 + (t.links.length ? t.links.length + 2 : 0)) * ROW_PX,
  };
}

/** One row a tap or a key can open: reached by Tab, named for screen readers, and marked when its details are shown. */
function openable(tr: HTMLElement, label: string): void {
  tr.setAttribute('tabindex', '0');
  tr.setAttribute('role', 'button');
  tr.setAttribute('aria-pressed', 'false');
  tr.setAttribute('aria-label', label);
}

/** The table, put in the card's viewport: the things, then the links. */
export function renderTable(viewport: HTMLElement, t: DiagramTable): HTMLElement {
  const wrap = viewport.createDiv({ cls: 'graph-note-table' });
  const things = wrap.createEl('table', { attr: { 'aria-label': 'Things' } });
  const head = things.createEl('thead').createEl('tr');
  for (const c of t.columns) head.createEl('th', { text: c, attr: { scope: 'col' } });
  const body = things.createEl('tbody');
  for (const r of t.rows) {
    const tr = body.createEl('tr', { attr: { 'data-key': r.key } });
    openable(tr, `${r.cells[1] ?? ''}: ${r.cells[0] ?? ''}`);
    for (const c of r.cells) tr.createEl('td', { text: c });
  }
  if (!t.links.length) return wrap;
  const links = wrap.createEl('table', { attr: { 'aria-label': 'Links' } });
  const top = links.createEl('thead').createEl('tr');
  for (const c of ['From', 'Link', 'To', 'Properties']) top.createEl('th', { text: c, attr: { scope: 'col' } });
  const rows = links.createEl('tbody');
  for (const l of t.links) {
    const tr = rows.createEl('tr', { attr: { 'data-link': String(l.index) } });
    openable(tr, `Link: ${l.cells.join(' ')}`);
    for (const c of [...l.cells, l.properties]) tr.createEl('td', { text: c });
  }
  return wrap;
}
