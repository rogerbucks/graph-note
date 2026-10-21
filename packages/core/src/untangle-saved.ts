// The legend's choices saved with a view (editor spec §25, untangle_legend; §7, view_saved_as_shown). The legend brings
// things forward and hides them (untangle.ts, `LegendFilter`). Those choices are written to the style graph only when
// the user saves the view as shown, never otherwise. They go in as the Shown's `legend`, a text such as 'kind:Person
// forward, type:NEAR hidden'. Read back, the view opens with its legend as it was saved. Here: the text written, and
// the text read and checked, each fault a problem on the Shown's line with its fix. The Python library reads it the
// same (graphspec/style/legend.py), held to one table, python/graph_spec/tests/legend_cases.json.
import { nearest } from './estimates.ts';
import type { StyledNames } from './style-checks.ts';
import { orList, wordFix } from './style-graph.ts';
import { nameFix } from './style-reader.ts';
import type { ThingReader } from './style-reader.ts';
import { word } from './words.ts';

/** What a legend's line may be saved as: brought forward, the rest faded; or hidden. A line as it is is not saved. */
export const LEGEND_CHOICES = ['forward', 'hidden'] as const;
/** Forward or hidden. */
export type LegendChoiceState = (typeof LEGEND_CHOICES)[number];

/** One line of the legend chosen: `kind:<Kind>` or `type:<TYPE>`, as `kindLegend` names it, and how it stands. */
export interface LegendChoice {
  id: string;
  state: LegendChoiceState;
}

/** What a legend may choose, before the colon of its id, and how it is said. */
const WHAT: Record<string, () => string> = {
  kind: () => word('styling.what.kind'),
  type: () => word('styling.what.type'),
};

/** A text with its leading and trailing spaces taken off, character by character (never a regular expression). */
function spaced(s: string): string {
  let from = 0,
    to = s.length;
  while (from < to && s[from] === ' ') from++;
  while (to > from && s[to - 1] === ' ') to--;
  return s.slice(from, to);
}

/** An id's kind of line and name, or null when it is neither `kind:<name>` nor `type:<name>`, with a name of one word. */
function idParts(id: string): { what: string; name: string } | null {
  const colon = id.indexOf(':'),
    what = id.slice(0, colon),
    name = id.slice(colon + 1);
  return colon > 0 && Object.hasOwn(WHAT, what) && name !== '' && !name.includes(':') ? { what, name } : null;
}

/** The text a Shown saves the choices as: each id and how it stands, comma-joined; '' for none. */
export function legendText(choices: readonly LegendChoice[]): string {
  return choices.map((c) => `${c.id} ${c.state}`).join(', ');
}

/** Why choices cannot be saved, or null: each must be a kind's or a type's line, forward or hidden, and chosen once. */
export function legendRefusal(choices: readonly LegendChoice[]): string | null {
  const seen = new Set<string>();
  for (const c of choices) {
    if (!idParts(c.id) || c.id.includes(' ') || c.id.includes(','))
      return word('styling.legend.not-a-line', { id: c.id });
    if (!(LEGEND_CHOICES as readonly string[]).includes(c.state))
      return word('styling.legend.saved-as', { among: orList(LEGEND_CHOICES), state: c.state });
    if (seen.has(c.id)) return word('styling.legend.twice', { id: c.id });
    seen.add(c.id);
  }
  return null;
}

/**
 * The choices a Shown's `legend` holds, read and checked against the graph it styles. Each entry between commas is an
 * id and a state, spaces around either taken off. Each fault is a problem with its fix, and that entry left out. A
 * fault is an empty entry, one that cannot be read, or a state not allowed. It may also be a kind or type the graph
 * lacks (the nearest given), or a line chosen again. One fault is said for each entry, the first found. The rest are
 * kept, in the order written.
 */
export function legendChecked(r: ThingReader, names: StyledNames): LegendChoice[] | undefined {
  const written = r.text('legend');
  if (written === undefined) return undefined;
  if (spaced(written) === '') return [];
  const kept: LegendChoice[] = [],
    seen = new Set<string>();
  for (const entry of written.split(',').map(spaced)) {
    const parts = entry.split(' ').filter(Boolean);
    const id = parts[0] ?? '',
      parsed = parts.length === 2 ? idParts(id) : null;
    if (!entry) r.report(word('styling.legend.empty'), word('styling.legend.empty.fix'));
    else if (!parsed) r.report(word('styling.legend.unreadable', { entry }), word('styling.legend.unreadable.fix'));
    else {
      const state = parts[1] ?? '';
      const among = parsed.what === 'kind' ? names.kinds : names.types;
      if (!(LEGEND_CHOICES as readonly string[]).includes(state))
        r.report(
          word('styling.legend.state-unknown', { state, among: orList(LEGEND_CHOICES) }),
          wordFix(state, LEGEND_CHOICES).fix,
        );
      else if (!among.has(parsed.name)) {
        const near = nearest(parsed.name, among),
          by = !near ? [] : 'one' in near ? [near.one] : near.several,
          what = WHAT[parsed.what]?.() ?? '';
        r.report(
          word('styling.not-in-graph', { written: parsed.name, what, graph: names.graph }),
          nameFix(parsed.name, by, what, names.graph),
        );
      } else if (seen.has(id)) r.report(word('styling.legend.twice', { id }), word('styling.legend.twice.fix'));
      else {
        seen.add(id);
        kept.push({ id, state: state as LegendChoiceState });
      }
    }
  }
  return kept;
}
