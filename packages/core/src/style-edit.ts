// Writing to the style graph (editor spec §2, §6, §7): a nudge, a look, whether a view fades or hides what is outside it,
// and how a view was shown — each written as text into the graph's style block, never into a data block. A note with no
// style block for the graph gets one, after the graph's last block, with its graph line and a comment saying whose style
// it is. A view's setting and how it was shown are each changed in place when already written, never written twice.
import { dataKind, gqlSpans, graphOf, styleOf } from './blocks.ts';
import type { Span } from './blocks.ts';
import { items } from './block-items.ts';
import { STYLE } from './layout.ts';
import { quoted } from './lock.ts';
import { insertBlockAfter, replaceBlock } from './store.ts';
import { FORMATS, LINES, NUDGE_WORDS, OUTSIDE, STYLE_HUES, orList } from './style-graph.ts';
import type { Frame, LinkTarget } from './style-graph.ts';
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
}

/** One change to a graph's style. */
export type StyleChange =
  { nudge: NudgeWrite } | { look: LookWrite } | { outside: { view: string; outside: string } } | { shown: ShownWrite };

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
  return null;
}

/** The thing to write for a change, its kind, the view it replaces the setting of (if any), or why it cannot be written. */
function thingFor(
  change: StyleChange,
): { kind: string; props: [string, Value][]; view?: string } | { refused: string } {
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
      view,
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
    ],
    view: s.view,
  };
}

const PREFIX: Record<string, string> = { Nudge: 'nudge', Look: 'look', ViewStyle: 'outside', Shown: 'shown' };

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
 * Refused, with the reason, for a graph the note lacks or a change the style graph would not accept.
 */
export function styleEdit(note: string, graph: string, change: StyleChange): StyleEdit {
  const spans = gqlSpans(note);
  const own = spans.filter((s) => graphOf(s.text) === graph && typeof dataKind(s.text) === 'string');
  if (!own.length) return { refused: `there is no graph ${graph} in this note to style` };
  const thing = thingFor(change);
  if ('refused' in thing) return thing;
  const styles = spans.filter((s) => styleOf(s.text) === graph);
  const written = styles.flatMap((s) => writtenIn(s.text).map((w) => ({ s, w })));
  const taken = new Set(written.flatMap(({ w }) => (w.variable ? [w.variable.name] : [])));
  // a view's setting, or how it was shown, already written for this view: changed where it is, keeping its id
  const same = thing.view
    ? written.find(({ w }) => w.writes && w.labels.includes(thing.kind) && w.props.get('view') === thing.view)
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
