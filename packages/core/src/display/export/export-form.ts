// The Export form on a drawing (spec §16). It asks what to export: the whole diagram, or on a view the view or the view
// with its faded context (export_two_scopes). It offers SVG or PNG (export_formats), light or dark
// (export_fixed_theme). It offers the data as a GQL block, CSV or GraphML (export_data_formats), which takes no theme.
// When the note's classification is above the configured level, it asks its question before anything is written
// (classified_export). A path that can be played is offered too, as an animated SVG at a pace chosen
// (path_animation_export). A graph or view too large to draw, shown as text, gets a bar of its own. Its Export button
// is for its data alone (`dataExportBar`).
import { DEFAULT_PACE, PATH_PACES, isDataFormat, word } from '@thoughtknot/core';
import type { DataFormat, ExportFormat, ExportTheme, ViewSpec } from '@thoughtknot/core';
import { button } from '../graph-view/view-bar';
import { waitShown } from '../progress';
import type { ExportAsk, ExportOutcome } from './export-types';
// (ExportOutcome's share holds the tap's own action: see export.ts)

/** What a drawing can export, and how: its note, graph and view, the default colours, and the export itself. */
export interface Exporting {
  path: string;
  graph: string;
  view?: { name: string; spec: ViewSpec };
  theme: ExportTheme;
  run: (ask: ExportAsk) => Promise<ExportOutcome>;
  /** Only the data: for a graph shown as text, which has no drawing to make an image of. */
  dataOnly?: boolean;
  /** The paths that can be played, each offered as an animated SVG of it played (§7, path_animation_export). */
  paths?: { id: string; title: string }[];
  /** The path chosen first, and the pace it is played at: as it was playing when Export as an animated SVG was pressed. */
  walk?: { id: string; pace: number };
}

const IMAGE_FORMATS: [string, string][] = [
  ['svg', 'SVG'],
  ['png', 'PNG'],
];
/** The data formats, said in the person's language when the form is drawn. */
const dataFormats = (): [string, string][] => [
  ['gql', word('export.data-gql')],
  ['csv', word('export.data-csv')],
  ['graphml', word('export.data-graphml')],
];

/** A pace, as the form offers it; what an exported file says of it stays in UK English (`paceSaid`). */
export const paceOffered = (ms: number): string =>
  ms === 500 ? word('export.pace-half') : word('export.pace-seconds', { count: ms / 1000 });

const select = (el: HTMLElement, label: string, options: [string, string][], value: string) => {
  const s = el.createEl('label', { text: label }).createEl('select', { attr: { 'aria-label': label } });
  for (const [v, n] of options) s.createEl('option', { text: n, attr: { value: v } });
  s.value = value;
  return s;
};

/** The Export form shown in `parent`, if there is one. */
const shownForm = (parent: HTMLElement) =>
  Array.from(parent.children).find((c) => c.classList.contains('thoughtknot-export'));

/** Shows the Export form in `el`, or takes it away when it is shown; the focus goes to its first choice. */
export function toggleExportForm(parent: HTMLElement, x: Exporting): void {
  const was = shownForm(parent);
  if (was) was.remove();
  else openExportForm(parent, x);
}

/**
 * Shows the Export form in `parent` as `x` asks, in place of one already shown, never taking it away. A played path's
 * Export as an animated SVG opens it like this, on that path. The focus goes to its first choice.
 */
export function openExportForm(parent: HTMLElement, x: Exporting): void {
  shownForm(parent)?.remove();
  const el = parent.createDiv({
    cls: 'thoughtknot-export',
    attr: { role: 'group', 'aria-label': word('export.form') },
  });
  const scopes: [string, string][] = x.view
    ? [
        ['view', word('export.view', { name: x.view.name })],
        ['context', word('export.view-in-context', { name: x.view.name })],
        ['whole', word('export.whole')],
      ]
    : [['whole', word('export.whole')]];
  // a path played, as an animated SVG of the whole diagram (§7): only where there is a drawing
  const paths = x.dataOnly ? [] : (x.paths ?? []);
  for (const p of paths) scopes.push([`path:${p.id}`, word('export.path', { title: p.title })]);
  const what = select(el, word('export.what'), scopes, x.walk ? `path:${x.walk.id}` : (scopes[0]?.[0] ?? 'whole'));
  // an image, or the data the image shows (export_data_formats); only the data where there is no drawing
  const formats = x.dataOnly ? dataFormats() : [...IMAGE_FORMATS, ...dataFormats()];
  const format = select(el, word('export.format'), formats, formats[0]?.[0] ?? 'gql');
  const paces = PATH_PACES.map((ms): [string, string] => [String(ms), paceOffered(ms)]);
  const pace = paths.length ? select(el, word('export.pace'), paces, String(x.walk?.pace ?? DEFAULT_PACE)) : null;
  const played = () => what.value.startsWith('path:');
  // a played path is an animated SVG, and only it has a pace
  const scoped = () => {
    if (played()) format.value = 'svg';
    format.disabled = played();
    if (pace) pace.disabled = !played();
    themed();
  };
  what.addEventListener('change', scoped);
  const theme = select(
    el,
    word('export.theme'),
    [
      ['light', word('settings.export-theme.light')],
      ['dark', word('settings.export-theme.dark')],
    ],
    x.theme,
  );
  // the data has no colours: the theme is offered only for an image
  const themed = () => {
    theme.disabled = isDataFormat(format.value);
  };
  format.addEventListener('change', themed);
  scoped();
  // what the form says beyond the notices: a question, or the image ready to share — never the same words twice
  const said = el.createDiv({ cls: 'thoughtknot-export-said', attr: { role: 'alert' } });
  // closed: the focus goes back to the bar's Export button, never lost to the page
  const close = () => {
    el.remove();
    Array.from(parent.querySelectorAll<HTMLElement>('.thoughtknot-bar button'))
      .find((b) => b.getAttribute('aria-label') === word('bar.export'))
      ?.focus();
  };
  let busy = false;
  const show = (outcome: ExportOutcome) => {
    said.empty();
    if ('ask' in outcome) {
      said.createSpan({ text: outcome.ask });
      const anyway = button(said, word('export.anyway'), 'check', () => void go(true), word('export.anyway'));
      button(said, word('export.do-not'), 'x', close, word('export.do-not'));
      anyway.focus();
    } else if ('share' in outcome) {
      said.createSpan({ text: word('export.ready', { name: outcome.share.name }) });
      // a phone opens its share sheet only from a tap of the person's own
      const share = button(
        said,
        word('export.share'),
        'share',
        () => void outcome.share.run().then(show),
        word('export.share'),
      );
      share.focus();
    } else if ('done' in outcome) close();
    else said.setText(outcome.stopped);
  };
  const go = async (confirmed: boolean) => {
    if (busy) return; // one export at a time: a second press while it works does nothing
    busy = true;
    it.disabled = true;
    el.setAttribute('aria-busy', 'true');
    const scope = what.value;
    const walk = played()
      ? { walk: { id: scope.slice('path:'.length), pace: Number(pace?.value ?? DEFAULT_PACE) } }
      : {};
    try {
      const done = await waitShown(el, word('progress.exporting'), (signal) =>
        x.run({
          signal,
          path: x.path,
          graph: x.graph,
          ...((scope === 'view' || scope === 'context') && x.view
            ? { view: x.view, context: scope === 'context' }
            : {}),
          ...walk,
          format: format.value as ExportFormat | DataFormat,
          theme: theme.value as ExportTheme,
          confirmed,
        }),
      );
      show(done === 'stopped' ? { stopped: word('progress.export-stopped') } : done);
    } finally {
      busy = false;
      it.disabled = false;
      el.removeAttribute('aria-busy');
    }
  };
  const it = button(el, word('export.it'), 'download', () => void go(false), word('export.it'));
  what.focus();
}

/**
 * A bar for a graph or view shown as text because it is too large to draw. It holds an Export button whose form offers
 * its data alone (export_data_formats), as the data needs no layout.
 */
export function dataExportBar(parent: HTMLElement, x: Exporting): void {
  const bar = parent.createDiv({
    cls: 'thoughtknot-bar',
    attr: { role: 'toolbar', 'aria-label': word('bar.name', { graph: x.graph }) },
  });
  button(bar, word('bar.export'), 'download', () => toggleExportForm(parent, { ...x, dataOnly: true }));
}
