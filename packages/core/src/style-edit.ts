// Writing to the style graph (editor spec §2, §6, §7, §14, §15): a nudge, a look, whether a view fades or hides what is
// outside it, how a view was shown, a property switched on or off inline, arrowheads hidden or shown, and the diagram
// type chosen — each written as text into the graph's style block, never into a data block. A note with no style block
// for the graph gets one, after the graph's last block, with its graph line and a comment saying whose style it is. A
// view's setting, how it was shown, and a choice of properties, arrowheads or diagram type are each changed in place
// when already written for the same place, never written twice.
import { dataKind, gqlSpans, graphOf, styleOf } from './blocks.ts';
import type { Span } from './blocks.ts';
import { items } from './block-items.ts';
import { STYLE } from './layout.ts';
import { quoted } from './lock.ts';
import { insertBlockAfter, replaceBlock } from './store.ts';
import { SHOW_FOR, TREE_ONLY } from './style-checks.ts';
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

/** A diagram type to choose (§15): for the whole graph or a view, and for a tree, the relationship it follows. */
export interface DiagramWrite {
  type: string;
  view?: string;
  relationship?: string;
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

/** Why a nudge cannot be written, or null. */
function nudgeRefusal(n: NudgeWrite): string | null {
  if (!(NUDGE_WORDS as readonly string[]).includes(n.word))
    return 'a nudge must be one of four words: beside, before, group or direction';
  if ((n.word === 'beside' || n.word === 'before') && !(n.thing && n.other))
    return `a ${n.word} nudge names two things: thing and other`;
  if (n.word === 'group' && !(n.thing && n.group)) return 'a group nudge names a thing and its group';
  if (n.word === 'direction' && !STYLE.directions.includes(n.direction ?? ''))
    return `a direction nudge names one of ${orList(STYLE.directions)}`;
  return null;
}

/** Why a look cannot be written, or null: the checks the style graph would make of its words, made before writing. */
function lookRefusal(l: LookWrite): string | null {
  if (!l.view === !l.path) return 'a look is for one view or one path';
  if ([l.thing, l.kind, l.link].filter(Boolean).length !== 1) return 'a look styles one thing, kind or link';
  if (!l.colour && !l.line && !l.format) return 'a look changes a colour, a line or a format';
  if (l.colour && !STYLE_HUES.includes(l.colour)) return `${l.colour} is not a colour of the locked style`;
  if (l.colour && !l.means) return `${l.colour} needs a meaning, for the legend: give means`;
  if (l.line && !(LINES as readonly string[]).includes(l.line)) return `line must be ${orList(LINES)}`;
  if (l.format && !(FORMATS as readonly string[]).includes(l.format)) return `format must be ${orList(FORMATS)}`;
  return null;
}

/** Why how a view was shown cannot be written, or null. */
function shownRefusal(s: ShownWrite): string | null {
  if (!s.view) return 'a view needs a name';
  if (![s.zoom, s.x, s.y].every(Number.isFinite) || s.zoom <= 0)
    return 'zoom, x and y must be numbers, and zoom above 0';
  const f = s.frame;
  if (f && ![f.x, f.y, f.width, f.height].every(Number.isFinite)) return 'frame must be four numbers';
  if (s.selected !== undefined && !s.selected) return 'selected must name a thing';
  const wrong = SWITCH_KEYS.find(
    (k) => s.switches?.[k] !== undefined && !(ON_OFF as readonly string[]).includes(s.switches[k] ?? ''),
  );
  if (wrong) return `${wrong} must be ${orList(ON_OFF)}`;
  return null;
}

/** Why a property cannot be switched on or off, or null. */
function showRefusal(s: ShowWrite): string | null {
  if (!s.property) return 'a Show names the property to show';
  if ([s.kind, s.thing, s.type].filter(Boolean).length !== 1) return SHOW_FOR;
  if (!(INLINE as readonly string[]).includes(s.inline)) return `inline must be ${orList(INLINE)}`;
  if (s.view === '') return 'a view needs a name';
  return null;
}

/** Why arrowheads cannot be hidden or shown so, or null. */
function arrowsRefusal(a: ArrowsWrite): string | null {
  if (!(ARROWHEADS as readonly string[]).includes(a.arrowheads)) return `arrowheads must be ${orList(ARROWHEADS)}`;
  if (a.type === '') return 'a relationship type needs a name';
  if (a.view === '') return 'a view needs a name';
  return null;
}

/** Why a diagram type cannot be chosen so, or null. */
function diagramRefusal(d: DiagramWrite): string | null {
  if (!(DIAGRAM_TYPES as readonly string[]).includes(d.type)) return `type must be ${orList(DIAGRAM_TYPES)}`;
  if (d.relationship !== undefined && d.type !== 'tree') return TREE_ONLY;
  if (d.relationship === '') return 'a relationship type needs a name';
  if (d.view === '') return 'a view needs a name';
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
    if (!view) return { refused: 'a view needs a name' };
    if (!(OUTSIDE as readonly string[]).includes(outside)) return { refused: `outside must be ${orList(OUTSIDE)}` };
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
 * The note with one change written to the style graph of `graph` (§2), as text: a nudge or a look added at the end of
 * the graph's last style block; a view's fade or hide, or how it was shown, changed in place where already written for
 * that view, else added. With no style block, one is made after the graph's last block: `// graph: <graph>_style · STYLE
 * <graph>` and a comment saying whose style it is. Ids are fresh (`nudge_1`, `look_2`). No data block is ever touched.
 * Refused, with the reason, for a graph the note lacks or a change the style graph would not accept — and for one that
 * names a thing drawn only under a suggested name, which it would write without the thing's fix (§4): accept its name
 * first. Such a thing is found in the note being written, as the reader reads it (`unnamedIn`), never in a drawing,
 * which can be older than the note.
 */
export function styleEdit(note: string, graph: string, change: StyleChange): StyleEdit {
  const spans = gqlSpans(note);
  const own = spans.filter((s) => graphOf(s.text) === graph && typeof dataKind(s.text) === 'string');
  if (!own.length) return { refused: `there is no graph ${graph} in this note to style` };
  const thing = thingFor(change);
  if ('refused' in thing) return thing;
  const blocks = spans.map((s) => s.text);
  const first = acceptNameFirst(unnamedIn(blocks, graph), graph, namedBy(change));
  if (first) return { refused: first };
  const styles = spans.filter((s) => styleOf(s.text) === graph);
  const written = styles.flatMap((s) => writtenIn(s.text).map((w) => ({ s, w })));
  const taken = new Set(written.flatMap(({ w }) => (w.variable ? [w.variable.name] : [])));
  // a view's setting, how it was shown, or a choice of properties or arrowheads, already written for the same place:
  // changed where it is, keeping its id
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
