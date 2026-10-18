// The style graph of a note (editor spec §2, §6, §7). Every style block of a graph is read with the reader the data is
// read with, so it is checked like any graph. What cannot be read is a problem on its line, and the rest is used. Then
// each thing is checked against the graph it styles, and the things against each other. Reading it never throws and
// never stops the drawing (broken_style_block). At worst the graph is drawn in the locked style, with the problems
// listed. It also gives what a host draws with it. That is the look of a thing or link in a view or path, and the
// legend for every colour used there.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import { blankText } from './block-items.ts';
import { graphOf, styleOf } from './blocks.ts';
import { textTooLarge } from './layout-limits.ts';
import type { NoteReading, Problem } from './note-reading.ts';
import { readBlocks, REREAD_BUDGET } from './partial-read.ts';
import { checkThings } from './style-checks.ts';
import type { RawThing, StyledNames } from './style-checks.ts';
import { settle } from './style-conflicts.ts';
import { emptyStyle } from './style-graph.ts';
import type { LegendEntry, Outside, Routing, StyleGraph, StyleScope, StyleTarget, ThingLook } from './style-graph.ts';
import { isSpace, S } from './whitespace.ts';
import { writtenIn } from './written-things.ts';
import type { Written } from './written-things.ts';

const HIDDEN = new Set<string>(gs.SCHEMA_LABELS);

/**
 * The names of graph `g`: its things, kinds, relationship types, paths, and the property names of a kind, a thing or a
 * relationship type's links.
 */
function namesOf(reading: Pick<NoteReading, 'whole'>, graph: string, g: Graph): StyledNames {
  const things = [...g.nodes.keys()].filter((i) => ![...(g.nodes.get(i)?.[0] ?? [])].some((l) => HIDDEN.has(l)));
  const kindsOf = (id: string) => [...(g.nodes.get(id)?.[0] ?? [])].filter((l) => !HIDDEN.has(l));
  const declared = gs.readings(g, gs.schemaFor(reading.whole, graph)[1]);
  return {
    graph,
    things: new Set(things),
    kinds: new Set(things.flatMap(kindsOf)),
    types: new Set([...g.edges.map(([, t]) => t), ...declared.keys()]),
    paths: new Set(g.labelled('Path')),
    properties: ({ kind, thing, type }) =>
      type !== undefined
        ? new Set(g.edges.filter(([, t]) => t === type).flatMap(([, , , props]) => Object.keys(props)))
        : new Set(
            things
              .filter((id) => (thing !== undefined ? id === thing : kindsOf(id).includes(kind ?? '')))
              .flatMap((id) => Object.keys(g.p(id)).filter((k) => k !== 'id')),
          ),
  };
}

/** Where a key is in a thing as written: where it starts, and where the text after its colon starts. */
function keyAt(blanked: string, w: Written, key: string): { start: number; after: number } | undefined {
  if (!w.braces) return undefined;
  // the key and its colon are found where strings are blanked, so a word inside a string is never taken for one
  const found = new RegExp(`(^|[{,${S.slice(1, -1)}])(${key.replace(/[^A-Za-z0-9_]/g, '\\$&')})${S}*:`, 'g');
  found.lastIndex = w.braces.open;
  const m = found.exec(blanked);
  if (!m || m.index > w.braces.close) return undefined;
  return { start: m.index + (m[1] ?? '').length, after: m.index + m[0].length };
}

/** A stretch of a block's text as a 0-based line and the characters it spans there. */
function spanOf(text: string, from: number, to: number): NonNullable<Problem['span']> {
  const start = text.lastIndexOf('\n', from - 1) + 1;
  return { line: text.slice(0, from).split('\n').length - 1, character: from - start, end: to - start };
}

/** Where a key is in a thing as written: its 0-based line in the block, and the characters it spans. */
function keySpan(text: string, blanked: string, w: Written, key: string): Problem['span'] {
  const at = keyAt(blanked, w, key);
  return at && spanOf(text, at.start, at.start + key.length);
}

/** Where a property's quoted text is in a thing as written: its 0-based line in the block, and the characters it spans. */
function valueSpan(text: string, blanked: string, w: Written, key: string): Problem['span'] {
  const at = keyAt(blanked, w, key);
  if (!at) return undefined;
  let quote = at.after;
  while (isSpace(text[quote] ?? '')) quote++;
  if (text[quote] !== "'") return undefined;
  const from = quote + 1;
  let end = from;
  while (end < text.length && text[end] !== "'" && text[end] !== '\n') end += text[end] === '\\' ? 2 : 1;
  return spanOf(text, from, end);
}

/** Each link written in a style block: a problem on its line, as a link means nothing in a style graph. */
function links(texts: string[], blocks: number[], graph: string): Problem[] {
  return blocks.flatMap((block) => {
    const blanked = blankText(texts[block] ?? '');
    return [...blanked.matchAll(/-\[/g)].map((m): Problem => ({
      graph,
      block,
      line: blanked.slice(0, m.index).split('\n').length,
      severity: 'error',
      message: 'a link means nothing in a style graph',
      fix: 'remove the link',
    }));
  });
}

/** What `readStyle` reads of a note besides its blocks: the graphs as read, to check the style's names against. */
export type StyleReading = Pick<NoteReading, 'world' | 'whole' | 'tooLarge'>;

/**
 * The style of `graph`: every style block of the note for it (`// graph: <name> · STYLE <graph>`). They are read with
 * the reader the data is read with, merged, and checked against the graph as the note reads it (`reading`, from
 * `readNote(texts)`). Problems carry the style block's index in `texts` and the line in it, as the reader's own do.
 * They carry the styled graph's name too, so they are listed with its drawing. Only what is sound is in the style;
 * nothing is ever written to the data.
 */
export function readStyle(
  texts: string[],
  graph: string,
  reading: StyleReading,
): { style: StyleGraph; problems: Problem[] } {
  const blocks = texts.flatMap((t, i) => (styleOf(t) === graph ? [i] : []));
  const first = { block: blocks[0] ?? 0, line: 1, id: '' };
  const fail = (message: string, fix: string) => ({
    style: emptyStyle(),
    problems: [{ graph, block: first.block, line: 1, severity: 'error' as const, message, fix }],
  });
  if (!blocks.length || reading.tooLarge) return { style: emptyStyle(), problems: [] };
  // measured before anything is read, as the data is (§9): a style too large never holds the page
  const big = textTooLarge(blocks.map((i) => texts[i] ?? ''));
  if (big?.reason === 'too-large')
    return fail(
      `the style is too large to read (${big.count} ${big.limit === 'text-lines' ? 'lines' : 'bytes'}, over ${big.most}), so the graph is drawn in the locked style`,
      'make the style smaller',
    );
  const g = reading.whole[graph] ?? reading.world[graph];
  if (!g)
    return fail(
      `there is no graph ${graph} in this note to style`,
      `write graph ${graph}, or style a graph the note has`,
    );
  const read = readBlocks(texts, [], REREAD_BUDGET, (t) => (styleOf(t) === graph ? 'data' : null));
  const problems = read.problems.filter((p) => p.severity !== 'hint').map((p) => ({ ...p, graph }));
  // where each thing is written: the first block and line that write it
  const where = new Map<string, { block: number; text: string; blanked: string; w: Written }>();
  for (const block of blocks) {
    const text = texts[block] ?? '',
      blanked = blankText(text),
      name = graphOf(text);
    for (const w of writtenIn(text)) {
      const key = `${name}\u0000${w.variable?.name}`;
      if (w.writes && w.variable && !where.has(key)) where.set(key, { block, text, blanked, w });
    }
  }
  const world = gs.worldFromStore(read.store),
    raws: RawThing[] = [];
  for (const [name, styleGraph] of Object.entries(world))
    for (const [id, [labels]] of styleGraph.nodes) {
      const at = where.get(`${name}\u0000${id}`);
      raws.push({
        labels: [...labels],
        props: styleGraph.p(id),
        at: at ? { block: at.block, line: at.text.slice(0, at.w.open).split('\n').length, id } : { ...first, id },
        span: (key) => (at ? valueSpan(at.text, at.blanked, at.w, key) : undefined),
        keySpan: (key) => (at ? keySpan(at.text, at.blanked, at.w, key) : undefined),
      });
    }
  raws.sort((a, b) => a.at.block - b.at.block || a.at.line - b.at.line);
  const checked = checkThings(raws, namesOf(reading, graph, g));
  const { style, problems: conflicts } = settle(checked, graph);
  // a style block named as a data graph: a reader that does not know STYLE merges it into the data. The graph
  // libraries' own Store does so too, in both languages. Only the drawing readers (blocks.ts, and the Python
  // library's reader/drawing.py) leave a style block out
  const named = blocks.flatMap((block): Problem[] => {
    const own = graphOf(texts[block] ?? '');
    return own && own in reading.whole
      ? [
          {
            graph,
            block,
            line: 1,
            severity: 'warning',
            message: `this style block takes the data graph ${own}'s name; it needs a name of its own, never a data graph's`,
            fix: `name it ${graph}_style: // graph: ${graph}_style · STYLE ${graph}`,
          },
        ]
      : [];
  });
  const all = [...named, ...problems, ...links(texts, blocks, graph), ...checked.problems, ...conflicts];
  return { style, problems: all.sort((a, b) => a.block - b.block || a.line - b.line) };
}

/** Whether a view fades or hides the things outside it, as its style graph says (§7): fade when nothing is written. */
export function outsideOf(style: StyleGraph, view: string): Outside {
  return style.views.get(view)?.outside ?? 'fade';
}

/**
 * How the links of the whole graph, or of `view`, are drawn (§25). That is their routing (untangle_routing), and
 * whether links running between the same groups are merged into trunks (untangle_merge). Each is a view's own over
 * the whole graph's; curved and unmerged when the style graph says nothing.
 */
export function linksOf(style: Pick<StyleGraph, 'links'>, view?: string): { routing: Routing; merge: boolean } {
  const chosen = <K extends 'routing' | 'merge'>(key: K) =>
    (view === undefined ? undefined : style.links.find((l) => l.view === view && l[key] !== undefined)?.[key]) ??
    style.links.find((l) => l.view === undefined && l[key] !== undefined)?.[key];
  return { routing: chosen('routing') ?? 'curved', merge: chosen('merge') === 'on' };
}

const inScope = (style: StyleGraph, scope: StyleScope) =>
  style.looks.filter(
    (l) => (scope.view !== undefined && l.view === scope.view) || (scope.path !== undefined && l.path === scope.path),
  );

/**
 * The look of a thing or a link in a view or path, for the host to draw. It is a named hue (drawn with theme.ts
 * `hueColour`, the locked blends), a line and a format. A look for the thing or link itself wins over one for its
 * kind; a later look over an earlier. Outside every view and path — or where nothing is styled — it is empty: the
 * locked style.
 */
export function lookOf(style: StyleGraph, scope: StyleScope, target: StyleTarget): ThingLook {
  const looks = inScope(style, scope);
  const chosen =
    'link' in target
      ? looks.filter(
          (l) => l.link?.from === target.link.from && l.link.type === target.link.type && l.link.to === target.link.to,
        )
      : [
          ...looks.filter((l) => l.kind !== undefined && (target.kind ?? '').split(' · ').includes(l.kind)),
          ...looks.filter((l) => l.thing === target.thing),
        ];
  const out: ThingLook = {};
  for (const l of chosen) {
    if (l.colour) out.hue = l.colour;
    if (l.line) out.line = l.line;
    if (l.format) out.format = l.format;
  }
  return out;
}

/**
 * The legend of a view or path (§7, styling_keeps_locked_rules): every colour styling uses there, once, with what it
 * means. A look's colour is only ever kept with its meaning, so every colour drawn in a scope is in its legend.
 */
export function legendOf(style: StyleGraph, scope: StyleScope): LegendEntry[] {
  const out: LegendEntry[] = [];
  for (const l of inScope(style, scope))
    if (l.colour && l.means && !out.some((e) => e.colour === l.colour)) out.push({ colour: l.colour, means: l.means });
  return out;
}
