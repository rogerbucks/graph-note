// A filter saved in the style graph (editor spec §53, scale_filter_live). Roger, 22 Oct 2026: a filter chosen where the
// note is edited is saved; in reading view it is only tried. Roger chose, 23 Oct 2026, one Filter line in the graph's
// style block for it:
//
//   (filter_1:Filter {keep: 'Kind: Task, Note; status: done'})
//
// Each part between semicolons is one filter: its name, a colon, then the values kept, comma-joined. `Kind` filters by
// kind; any other name is a property. A Filter with `view` is for that view; with none, for the whole graph. A `keep`
// of '' keeps everything. Here: the text written, the text read and checked, and what it keeps.
import { nearest } from './estimates.ts';
import type { Problem } from './note-reading.ts';
import type { RawThing, StyledNames } from './style-checks.ts';
import type { StyleAt } from './style-graph.ts';
import { nameFix, reader } from './style-reader.ts';
import { word } from './words.ts';

/** The filter that sorts things by their kind, as the overview names it (facet-counts.ts, `facetsOf`). */
export const KIND_FILTER = 'Kind';

/** A filter's choice: for each filter by name, the values kept, in the order chosen. */
export type FilterKeep = Readonly<Record<string, readonly string[]>>;

/** A filter read from the style graph, checked. */
export interface SavedFilter {
  keep: FilterKeep;
  /** The view it is for; none, the whole graph. */
  view?: string;
  at: StyleAt;
}

/** The marks that split a Filter's text, which no name or value it saves may hold. */
const MARKS = [';', ':', ','];

/** The text a Filter's `keep` saves: each filter with a value kept, its name, a colon and its values. */
export function filterText(keep: FilterKeep): string {
  return Object.entries(keep)
    .filter(([, values]) => values.length)
    .map(([name, values]) => `${name}: ${values.join(', ')}`)
    .join('; ');
}

/** Why `keep` cannot be saved, or null: a name or value that is empty or holds a mark the text is split by. */
export function filterRefusal(keep: FilterKeep): string | null {
  for (const [name, values] of Object.entries(keep))
    for (const text of [name, ...values])
      if (!text.trim() || MARKS.some((m) => text.includes(m))) return word('styling.filter.unsaved', { text });
  return null;
}

/**
 * A Filter, checked against the graph it styles: each part a name and the values kept. A part not read, a filter named
 * twice, or a kind the graph lacks is a problem with its fix. It is left out, and the rest is kept.
 */
export function filterOf(raw: RawThing, names: StyledNames, out: Problem[]): SavedFilter | null {
  const r = reader(raw, names, out);
  const text = r.text('keep');
  const view = r.text('view');
  if (text === undefined) {
    r.missing(word('styling.filter.keep'), word('styling.filter.keep.fix'));
    return null;
  }
  const keep: Record<string, string[]> = {};
  for (const part of text.split(';')) {
    if (!part.trim()) continue;
    const colon = part.indexOf(':');
    const name = part.slice(0, colon).trim();
    const values = part
      .slice(colon + 1)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (colon < 0 || !name || !values.length) {
      r.report(word('styling.filter.unreadable', { part: part.trim() }), word('styling.filter.unreadable.fix'));
      continue;
    }
    if (Object.hasOwn(keep, name)) {
      r.report(word('styling.filter.twice', { name }), word('styling.legend.twice.fix'));
      continue;
    }
    const unknown = name === KIND_FILTER ? values.filter((v) => !names.kinds.has(v)) : [];
    for (const v of unknown) {
      const near = nearest(v, names.kinds),
        by = !near ? [] : 'one' in near ? [near.one] : near.several;
      const what = word('styling.what.kind');
      r.report(
        word('styling.not-in-graph', { written: v, what, graph: names.graph }),
        nameFix(v, by, what, names.graph),
      );
    }
    keep[name] = values.filter((v) => !unknown.includes(v));
  }
  return { keep, ...(view === undefined ? {} : { view }), at: raw.at };
}

/** The Filter for `view`, or for the whole graph with none: the first written of those for it. */
export function savedFilterFor(filters: readonly SavedFilter[], view?: string): FilterKeep | undefined {
  return filters.find((f) => f.view === view)?.keep;
}
