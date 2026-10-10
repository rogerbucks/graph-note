// The Export form on a drawing (spec §16): what to export — the whole diagram, or on a view the view or the view with its
// faded context (export_two_scopes) — as SVG or PNG (export_formats), light or dark (export_fixed_theme); and, when the
// note's classification is above the configured level, the question asked before anything is written (classified_export).
import type { ExportFormat, ExportTheme, ViewSpec } from '@graph-note/core';
import { button } from '../graph-view/view-bar';
import type { ExportAsk, ExportOutcome } from './export';

/** What a drawing can export, and how: its note, graph and view, the default colours, and the export itself. */
export interface Exporting {
  path: string;
  graph: string;
  view?: { name: string; spec: ViewSpec };
  theme: ExportTheme;
  run: (ask: ExportAsk) => Promise<ExportOutcome>;
}

const select = (el: HTMLElement, label: string, options: [string, string][], value: string) => {
  const s = el.createEl('label', { text: label }).createEl('select', { attr: { 'aria-label': label } });
  for (const [v, n] of options) s.createEl('option', { text: n, attr: { value: v } });
  s.value = value;
  return s;
};

/** Shows the Export form in `el`, or takes it away when it is shown; the focus goes to its first choice. */
export function toggleExportForm(parent: HTMLElement, x: Exporting): void {
  const was = parent.querySelector(':scope > .graph-note-export');
  if (was) return void was.remove();
  const el = parent.createDiv({ cls: 'graph-note-export', attr: { role: 'group', 'aria-label': 'Export' } });
  const scopes: [string, string][] = x.view
    ? [
        ['view', `View ${x.view.name}`],
        ['context', `View ${x.view.name}, with the rest faded`],
        ['whole', 'The whole diagram'],
      ]
    : [['whole', 'The whole diagram']];
  const what = select(el, 'What to export', scopes, scopes[0]?.[0] ?? 'whole');
  const format = select(
    el,
    'Format',
    [
      ['svg', 'SVG'],
      ['png', 'PNG'],
    ],
    'svg',
  );
  const theme = select(
    el,
    'Theme',
    [
      ['light', 'Light'],
      ['dark', 'Dark'],
    ],
    x.theme,
  );
  const said = el.createDiv({ cls: 'graph-note-export-said', attr: { role: 'alert' } });
  const go = async (confirmed: boolean) => {
    said.empty();
    const scope = what.value;
    const outcome = await x.run({
      path: x.path,
      graph: x.graph,
      ...(scope !== 'whole' && x.view ? { view: x.view, context: scope === 'context' } : {}),
      format: format.value as ExportFormat,
      theme: theme.value as ExportTheme,
      confirmed,
    });
    if ('ask' in outcome) {
      said.createSpan({ text: outcome.ask });
      button(said, 'Export anyway', 'check', () => void go(true), 'Export anyway');
      button(said, 'Do not export', 'x', () => el.remove(), 'Do not export');
    } else if ('done' in outcome) el.remove();
    else said.setText(outcome.stopped);
  };
  button(el, 'Export it', 'download', () => void go(false), 'Export it');
  what.focus();
}
