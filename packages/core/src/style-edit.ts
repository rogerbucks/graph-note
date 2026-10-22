// Writing to the style graph (editor spec §2, §6, §7, §14, §15). It writes a nudge, a look, and whether a view fades
// or hides what is outside it. It writes how a view was shown, a property switched on or off inline, arrowheads hidden
// or shown, and the diagram type chosen. Each is written as text into the graph's style block, never a data block. A
// note with no style block for the graph gets one after its last block. It has its graph line and a comment saying
// whose style it is. A view's setting and how it was shown are changed in place when already written for the same
// place. So is a choice of properties, arrowheads or diagram type. None is ever written twice.
import { dataKind, gqlSpans, graphOf, styleOf } from './blocks.ts';
import type { Span } from './blocks.ts';
import { items } from './block-items.ts';
import { STYLE } from './layout.ts';
import { quoted } from './lock.ts';
import { insertBlockAfter, replaceBlock } from './store.ts';
import { centreRefusal, diagramTypeKnown, showFor, timelineRefusal, treeOnly } from './style-checks.ts';
import {
  ARROWHEADS,
  DIAGRAM_TYPES,
  FORMATS,
  INLINE,
  LINES,
  NUDGE_WORDS,
  ON_OFF,
  OUTSIDE,
  STYLE_HUES,
  orList,
} from './style-graph.ts';
import type { Frame, LinkTarget } from './style-graph.ts';
import { acceptNameFirst, unnamedIn } from './suggested-names.ts';
import { legendRefusal, legendText } from './untangle-saved.ts';
import type { LegendChoice } from './untangle-saved.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';

/** A nudge to write: its word, and the parts that word needs. */
export interface NudgeWrite {
  word: string;
  thing?: string;
  other?: string;
  group?: string;
  direction?: string;
}

/** A look to write: one view or path, one thing, kind or link, and a colour (with what it means), line or format. */
export interface LookWrite {
  view?: string;
  path?: string;
  thing?: string;
  kind?: string;
  link?: LinkTarget;
  colour?: string;
  line?: string;
  format?: string;
  means?: string;
}

/** How a view is shown now, to save when the user asks: its zoom, position, the area framed and what is selected. */
export interface ShownWrite {
  view: string;
  zoom: number;
  x: number;
  y: number;
  frame?: Frame;
  selected?: string;
  /** The View menu's switches as they stand (§25, view_switch_view_only), each on or off. */
  switches?: Partial<Record<(typeof SWITCH_KEYS)[number], string>>;
  /** The legend's lines brought forward or hidden (§25, untangle_legend), as `LegendFilter.choices` gives them. */
  legend?: readonly LegendChoice[];
}

/** The switches a view saved as shown keeps, in the order they are written. */
const SWITCH_KEYS = ['labels', 'hubs', 'groups', 'merge'] as const;

/** A property to switch on or off for showing inline (§14): for one kind, thing or relationship type, in a view or not. */
export interface ShowWrite {
  property: string;
  kind?: string;
  thing?: string;
  type?: string;
  view?: string;
  inline: string;
}

/** Arrowheads to hide or show (§15): for every link or one relationship type's, in a view or the whole graph. */
export interface ArrowsWrite {
  arrowheads: string;
  view?: string;
  type?: string;
}

/** A diagram type to choose (§15), for the graph or a view; a tree's relationship, timeline order or radial centre. */
export interface DiagramWrite {
  type: string;
  view?: string;
  relationship?: string;
  centre?: string;
  order?: string;
  by?: string;
  show?: string;
}

/** One change to a graph's style. */
export type StyleChange =
  | { nudge: NudgeWrite }
  | { look: LookWrite }
  | { outside: { view: string; outside: string } }
  | { shown: ShownWrite }
  | { show: ShowWrite }
  | { arrows: ArrowsWrite }
  | { diagram: DiagramWrite };

/** What a style edit gives: the new note, or the reason nothing was written. */
export type StyleEdit = { note: string } | { refused: string };

type Value = string | number | undefined;

/** A thing written as GQL writes it: its id and kind, then each property given, strings quoted, comma-joined. */
function thingText(id: string, kind: string, props: [string, Value][]): string {
  const given = props.filter((p): p is [string, string | number] => p[1] !== undefined);
  return `(${id}:${kind} {${given.map(([k, v]) => `${k}: ${typeof v === 'string' ? quoted(v) : String(v)}`).join(', ')}})`;
}

/** That `key` must be one of `among`, said as the style graph's check says it. */
const mustBe = (key: string, among: readonly string[]) => word('styling.must-be', { key, among: orList(among) });

/** That a view needs a name. */
const noViewName = () => word('editing.style.view-name');

/** Why a nudge cannot be written, or null. */
function nudgeRefusal(n: NudgeWrite): string | null {
  if (!(NUDGE_WORDS as readonly string[]).includes(n.word)) return word('styling.nudge.four-words');
  if ((n.word === 'beside' || n.word === 'before') && !(n.thing && n.other))
    return word('styling.nudge.two-things', { word: n.word });
  if (n.word === 'group' && !(n.thing && n.group)) return word('styling.nudge.group');
  if (n.word === 'direction' && !STYLE.directions.includes(n.direction ?? ''))
    return word('editing.style.direction', { among: orList(STYLE.directions) });
  return null;
}

/** Why a look cannot be written, or null: the checks the style graph would make of its words, made before writing. */
function lookRefusal(l: LookWrite): string | null {
  if (!l.view === !l.path) return word('editing.style.look-place');
  if ([l.thing, l.kind, l.link].filter(Boolean).length !== 1) return word('editing.style.look-target');
  if (!l.colour && !l.line && !l.format) return word('editing.style.look-change');
  if (l.colour && !STYLE_HUES.includes(l.colour)) return word('styling.look.colour-unknown', { written: l.colour });
  if (l.colour && !l.means) return word('editing.style.means', { colour: l.colour });
  if (l.line && !(LINES as readonly string[]).includes(l.line)) return mustBe('line', LINES);
  if (l.format && !(FORMATS as readonly string[]).includes(l.format)) return mustBe('format', FORMATS);
  return null;
}

/** Why how a view was shown cannot be written, or null. */
function shownRefusal(s: ShownWrite): string | null {
  if (!s.view) return noViewName();
  if (![s.zoom, s.x, s.y].every(Number.isFinite) || s.zoom <= 0) return word('editing.style.shown-numbers');
  const f = s.frame;
  if (f && ![f.x, f.y, f.width, f.height].every(Number.isFinite)) return word('editing.style.frame');
  if (s.selected !== undefined && !s.selected) return word('editing.style.selected');
  const wrong = SWITCH_KEYS.find(
    (k) => s.switches?.[k] !== undefined && !(ON_OFF as readonly string[]).includes(s.switches[k] ?? ''),
  );
  if (wrong) return mustBe(wrong, ON_OFF);
  return legendRefusal(s.legend ?? []);
}

/** Why a property cannot be switched on or off, or null. */
function showRefusal(s: ShowWrite): string | null {
  if (!s.property) return word('styling.show.property');
  if ([s.kind, s.thing, s.type].filter(Boolean).length !== 1) return showFor();
  if (!(INLINE as readonly string[]).includes(s.inline)) return mustBe('inline', INLINE);
  if (s.view === '') return noViewName();
  return null;
}

/** Why arrowheads cannot be hidden or shown so, or null. */
function arrowsRefusal(a: ArrowsWrite): string | null {
  if (!(ARROWHEADS as readonly string[]).includes(a.arrowheads)) return mustBe('arrowheads', ARROWHEADS);
  if (a.type === '') return word('editing.style.type-name');
  if (a.view === '') return noViewName();
  return null;
}

/** Why a diagram type cannot be chosen so, or null. */
function diagramRefusal(d: DiagramWrite): string | null {
  if (!diagramTypeKnown(d.type)) return mustBe('type', DIAGRAM_TYPES);
  if (d.relationship !== undefined && d.type !== 'tree') return treeOnly();
  if (d.relationship === '') return word('editing.style.type-name');
  const chosen = centreRefusal(d) ?? timelineRefusal(d);
  if (chosen) return chosen;
  if (d.view === '') return noViewName();
  return null;
}

/** A thing to write: its kind and properties, and the values that find one already written to change in place. */
type ToWrite = { kind: string; props: [string, Value][]; match?: [string, string | undefined][] };

/** A Show, an Arrows or a Diagram to write, changed in place where one is written for the same place, or why it cannot be. */
function choiceFor(
  change: { show: ShowWrite } | { arrows: ArrowsWrite } | { diagram: DiagramWrite },
): ToWrite | { refused: string } {
  if ('diagram' in change) {
    const d = change.diagram,
      why = diagramRefusal(d);
    if (why) return { refused: why };
    return {
      kind: 'Diagram',
      props: [
        ['type', d.type],
        ['view', d.view],
        ['relationship', d.relationship],
        ['centre', d.centre],
        ['order', d.order],
        ['by', d.by],
        ['show', d.show],
      ],
      match: [['view', d.view]],
    };
  }
  if ('show' in change) {
    const s = change.show,
      why = showRefusal(s);
    if (why) return { refused: why };
    const place: [string, string | undefined][] = [
      ['property', s.property],
      ['kind', s.kind || undefined],
      ['thing', s.thing || undefined],
      ['type', s.type || undefined],
      ['view', s.view],
    ];
    return { kind: 'Show', props: [...place, ['inline', s.inline]], match: place };
  }
  const a = change.arrows,
    why = arrowsRefusal(a);
  if (why) return { refused: why };
  const place: [string, string | undefined][] = [
    ['view', a.view],
    ['type', a.type],
  ];
  return { kind: 'Arrows', props: [['arrowheads', a.arrowheads], ...place], match: place };
}

/** The thing to write for a change, its kind, what finds one to change in place (if any), or why it cannot be written. */
function thingFor(change: StyleChange): ToWrite | { refused: string } {
  if ('show' in change || 'arrows' in change || 'diagram' in change) return choiceFor(change);
  if ('nudge' in change) {
    const n = change.nudge,
      why = nudgeRefusal(n);
    if (why) return { refused: why };
    return {
      kind: 'Nudge',
      props: [
        ['word', n.word],
        ['thing', n.thing],
        ['other', n.other],
        ['group', n.group],
        ['direction', n.direction],
      ],
    };
  }
  if ('look' in change) {
    const l = change.look,
      why = lookRefusal(l);
    if (why) return { refused: why };
    const props: [string, Value][] = [
      ['view', l.view],
      ['path', l.path],
      ['thing', l.thing],
      ['kind', l.kind],
    ];
    if (l.link) props.push(['from', l.link.from], ['type', l.link.type], ['to', l.link.to]);
    props.push(['colour', l.colour], ['line', l.line], ['format', l.format], ['means', l.means]);
    return { kind: 'Look', props };
  }
  if ('outside' in change) {
    const { view, outside } = change.outside;
    if (!view) return { refused: noViewName() };
    if (!(OUTSIDE as readonly string[]).includes(outside)) return { refused: mustBe('outside', OUTSIDE) };
    return {
      kind: 'ViewStyle',
      props: [
        ['view', view],
        ['outside', outside],
      ],
      match: [['view', view]],
    };
  }
  const s = change.shown,
    why = shownRefusal(s);
  if (why) return { refused: why };
  const f = s.frame ? [s.frame.x, s.frame.y, s.frame.width, s.frame.height].join(',') : undefined;
  return {
    kind: 'Shown',
    props: [
      ['view', s.view],
      ['zoom', s.zoom],
      ['x', s.x],
      ['y', s.y],
      ['frame', f],
      ['selected', s.selected],
      ...SWITCH_KEYS.map((k): [string, Value] => [k, s.switches?.[k]]),
      // written only when something is chosen, and only here, as the view is saved as shown (untangle_legend)
      ['legend', s.legend?.length ? legendText(s.legend) : undefined],
    ],
    match: [['view', s.view]],
  };
}

/** The things a change names by their ids: what it would write into the style graph by name. */
function namedBy(change: StyleChange): string[] {
  const named = (...ids: (string | undefined)[]) => ids.filter((id): id is string => !!id);
  if ('nudge' in change) return named(change.nudge.thing, change.nudge.other);
  if ('look' in change) return named(change.look.thing, change.look.link?.from, change.look.link?.to);
  if ('shown' in change) return named(change.shown.selected);
  if ('show' in change) return named(change.show.thing);
  return [];
}

const PREFIX: Record<string, string> = {
  Nudge: 'nudge',
  Look: 'look',
  ViewStyle: 'outside',
  Shown: 'shown',
  Show: 'show',
  Arrows: 'arrows',
  Diagram: 'diagram',
};

/** The block with a thing written after its last item, comma-joined, the rest of the block kept as it was. */
function appended(block: string, thing: string): string {
  const last = items(block).at(-1);
  const at = last ? (last.comma !== -1 ? last.comma + 1 : last.to) : block.length;
  const lead = last && last.comma === -1 ? ',\n' : '\n';
  return `${block.slice(0, at)}${lead}${thing}${block.slice(at)}`;
}

/**
 * The note with one change written to the style graph of `graph` (§2), as text. A nudge or a look is added at the end
 * of the graph's last style block. A view's fade or hide, or how it was shown, is changed in place where already
 * written for that view, else added. With no style block, one is made after the graph's last block: `// graph:
 * <graph>_style · STYLE <graph>` and a comment saying whose style it is. Ids are fresh (`nudge_1`, `look_2`). No data
 * block is ever touched. Refused, with the reason, for a graph the note lacks or a change the style graph would not
 * accept. Refused too for one naming a thing drawn only under a suggested name, which it would write without the
 * thing's fix (§4). Accept its name first. Such a thing is found in the note being written, as the reader reads it
 * (`unnamedIn`). Never in a drawing, which can be older than the note.
 */
export function styleEdit(note: string, graph: string, change: StyleChange): StyleEdit {
  const spans = gqlSpans(note);
  const own = spans.filter((s) => graphOf(s.text) === graph && typeof dataKind(s.text) === 'string');
  if (!own.length) return { refused: word('styling.no-graph', { graph }) };
  const thing = thingFor(change);
  if ('refused' in thing) return thing;
  const blocks = spans.map((s) => s.text);
  const first = acceptNameFirst(unnamedIn(blocks, graph), graph, namedBy(change));
  if (first) return { refused: first };
  const styles = spans.filter((s) => styleOf(s.text) === graph);
  const written = styles.flatMap((s) => writtenIn(s.text).map((w) => ({ s, w })));
  const taken = new Set(written.flatMap(({ w }) => (w.variable ? [w.variable.name] : [])));
  // a view's setting, how it was shown, or a choice of properties or arrowheads, already written for the same place.
  // It is changed where it is, keeping its id
  const match = thing.match;
  const same = match
    ? written.find(
        ({ w }) => w.writes && w.labels.includes(thing.kind) && match.every(([k, v]) => w.props.get(k) === v),
      )
    : undefined;
  if (same?.w.variable) {
    const text = thingText(same.w.variable.name, thing.kind, thing.props);
    return result(
      replaceBlock(note, ref(same.s), same.s.text.slice(0, same.w.open) + text + same.s.text.slice(same.w.close + 1)),
    );
  }
  let n = 1;
  const prefix = PREFIX[thing.kind] ?? 'style';
  while (taken.has(`${prefix}_${n}`)) n++;
  const text = thingText(`${prefix}_${n}`, thing.kind, thing.props);
  const last = styles.at(-1);
  if (last) return result(replaceBlock(note, ref(last), appended(last.text, text)));
  const names = new Set(spans.map((s) => graphOf(s.text)));
  let name = `${graph}_style`;
  for (let k = 2; names.has(name); k++) name = `${graph}_style_${k}`;
  const block = [
    `// graph: ${name} · STYLE ${graph}`,
    `// The style of graph ${graph}: how it is drawn, never its data (editor spec §2).`,
    text,
  ].join('\n');
  return result(insertBlockAfter(note, ref(own.at(-1) as Span), block));
}

const ref = (s: Span) => ({ line: s.open, text: s.text });
const result = (r: ReturnType<typeof replaceBlock>): StyleEdit => (r.ok ? { note: r.note } : { refused: r.reason });
