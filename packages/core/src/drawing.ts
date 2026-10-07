// What a note's graph blocks draw (spec §3) — the boxes and links of each graph, chosen as graph-spec-draw.py chooses
// them, so the core's layout source matches graph_svg.py's (spec §12). A graph with problems is still drawn: a path
// that cannot be read is left out, the rest of its block is drawn, and what was left out is listed as a problem.
import gs from '@graph-note/graph-spec';
import type { Graph, World } from '@graph-note/graph-spec';

/** A gql block in a note: its text, and the note line (1-based) its opening fence is on. */
export interface Block {
  text: string;
  line: number;
}

/** One thing to draw: its id, its kinds joined by a dot, and its text. */
export interface Box {
  key: string;
  kind: string;
  text: string;
}

/** One link to draw, read in its schema's words. */
export interface Link {
  from: string;
  type: string;
  reading: string;
  to: string;
}

export interface GraphDrawing {
  graph: string;
  boxes: Box[];
  links: Link[];
}

/** Something that could not be read: its graph, the block (index in the note), the line in that block (1 = its graph line), what is wrong, and the fix. */
export interface Problem {
  graph: string | null;
  block: number;
  line: number;
  message: string;
  fix: string;
}

export interface NoteReading {
  graphs: Map<string, GraphDrawing>;
  problems: Problem[];
  /** The blocks as written, up to the one drawn. */
  texts: string[];
  /** The world as read, for checks and details. */
  world: World;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*gql\s*$/i;

/** The gql fenced blocks of a note, in order. An unclosed fence runs to the end, as Markdown reads it. */
export function gqlBlocks(note: string): Block[] {
  const lines = note.split('\n'), out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i] ?? '');
    if (!open) continue;
    const mark = open[1] ?? '```', close = new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j] ?? '')) j++;
    out.push({ text: lines.slice(i + 1, j).join('\n'), line: i + 1 });
    i = j;
  }
  return out;
}

/** A top-level item of a block — one path, or one SET or MATCH clause — by its character span. */
interface Item {
  from: number;
  to: number;
  /** The comma that separates it from the next item, if any. */
  comma: number;
}

/** Splits a block into its top-level items: at commas outside brackets, strings and comments, and before SET, MATCH and INSERT. */
function items(text: string): Item[] {
  const out: Item[] = [];
  let depth = 0, start = -1, last = -1;
  const end = (comma: number) => { if (start !== -1) out.push({ from: start, to: last + 1, comma }); start = -1; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (/\s/.test(c)) continue;
    if (depth === 0 && /[A-Za-z]/.test(c) && (i === 0 || !/\w/.test(text[i - 1] ?? ''))) {
      const w = /^[A-Za-z]+/.exec(text.slice(i))?.[0].toUpperCase();
      if ((w === 'SET' || w === 'MATCH' || w === 'INSERT') && start !== -1) end(-1);
    }
    if (c === ',' && depth === 0) { end(i); continue; }
    if (start === -1) start = i;
    if (c === "'") {
      i++;
      while (i < text.length && text[i] !== "'") i += text[i] === '\\' ? 2 : 1;
      i = Math.min(i, text.length - 1);
    } else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
    last = i;
  }
  end(-1);
  return out;
}

const lineAt = (text: string, pos: number) => text.slice(0, pos).split('\n').length;

/** The block with an item blanked out (newlines kept, so every other line keeps its number), with the comma beside it. */
function without(text: string, all: Item[], drop: Item[]): string {
  const chars = [...text];
  const blank = (from: number, to: number) => { for (let k = from; k < to; k++) if (chars[k] !== '\n') chars[k] = ' '; };
  for (const it of drop) {
    blank(it.from, it.to);
    if (it.comma !== -1) blank(it.comma, it.comma + 1);
    else {
      const before = all[all.indexOf(it) - 1];
      if (before && before.comma !== -1 && !drop.includes(before)) blank(before.comma, before.comma + 1);
    }
  }
  return chars.join('');
}

/** The graph a block names, or null. */
const graphOf = (text: string): string | null => /^\s*\/\/\s*graph:\s*(\S+)/.exec(text.split('\n').find((l) => l.trim()) ?? '')?.[1] ?? null;

const isGraphLine = (text: string) => /^\s*\/\/\s*graph:/.test(text.split('\n').find((l) => l.trim()) ?? '');

/** The kind of a block, or null when it holds no data to draw: a query, an excerpt, a change set, or no graph line. */
function dataKind(text: string): 'data' | 'schema' | null | Problem {
  try {
    const [, kind] = gs.header(text);
    return kind === 'data' || kind === 'schema' ? kind : null;
  } catch (e) {
    if (!isGraphLine(text)) return null;
    const p = e instanceof gs.ProfileError ? e : null;
    return { graph: null, block: -1, line: p?.line ?? 1, message: p?.msg ?? 'the graph line cannot be read', fix: p?.fix ?? "start the block with '// graph: <name>'" };
  }
}

/** The graph a block draws: its name when it is a data block with a graph line, else null — a query, schema, excerpt or plain code. */
export function graphOfBlock(text: string): string | null {
  return dataKind(text) === 'data' ? graphOf(text) : null;
}

/**
 * Reads a note's data blocks, leaving out what cannot be read. Returns the blocks as read and the problems.
 * Each block is applied in order to a fresh store; when one fails, the item at the failing line is blanked and the
 * whole read starts again, so a half-applied block never leaves part of a bad path behind.
 */
function readBlocks(texts: string[], shared: string[]): { store: gs.Store; problems: Problem[] } {
  const clean = texts.slice(), problems: Problem[] = [], skip = new Set<number>();
  texts.forEach((t, i) => {
    const k = dataKind(t);
    if (k === null) skip.add(i);
    else if (typeof k === 'object') { skip.add(i); problems.push({ ...k, block: i, graph: graphOf(t) }); }
  });
  for (let attempt = 0; ; attempt++) {
    const store = new gs.Store();
    for (const s of shared) { try { store.apply(s); } catch { /* a shared schema that cannot be read types nothing */ } }
    let failed: { block: number; error: unknown } | null = null;
    for (let i = 0; i < clean.length && !failed; i++) {
      if (skip.has(i)) continue;
      try { store.apply(clean[i] ?? ''); } catch (error) { failed = { block: i, error }; }
    }
    if (!failed) return { store, problems: problems.sort((a, b) => a.block - b.block || a.line - b.line) };
    const { block, error } = failed, text = clean[block] ?? '';
    const pe = error instanceof gs.ProfileError ? error : null;
    const line = pe?.line ?? 1;
    const problem: Problem = { graph: graphOf(text), block, line, message: pe?.msg ?? 'this could not be read', fix: pe?.fix ?? 'check the line against the guide to writing a graph note' };
    const all = items(text);
    const touching = all.filter((it) => lineAt(text, it.from) <= line && line <= lineAt(text, it.to - 1));
    const before = all.filter((it) => lineAt(text, it.from) <= line).pop();
    const drop = touching.length ? touching : before ? [before] : [];
    if (!drop.length || attempt > texts.length + all.length * 2) { skip.add(block); problems.push(problem); continue; }
    // Of several items on the failing line, leave out only the one at fault when that can be told.
    let chosen = drop;
    if (drop.length > 1) {
      chosen = [drop.find((it) => {
        const trial = without(text, all, [it]);
        try { const s = new gs.Store(); s.apply(trial); return true; } catch (e) { return !(e instanceof gs.ProfileError && e.line === line); }
      }) ?? drop[0]].filter((x): x is Item => !!x);
      if (!chosen.length) chosen = drop;
    }
    clean[block] = without(text, all, chosen);
    problems.push(problem);
  }
}

/** A thing's text: its name, else its title, text or label, else its id — as graph-spec-draw.py chooses. */
function textOf(g: Graph, id: string): string {
  const p = g.p(id);
  for (const k of ['name', 'title', 'text', 'label']) { const v = p[k]; if (typeof v === 'string' && v) return v; }
  return id;
}

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function drawingOf(world: World, name: string, own: Graph | undefined): GraphDrawing {
  const g = world[name] as Graph;
  const hidden = new Set(gs.SCHEMA_LABELS);
  const shared = g.labelled('ElementType').length ? undefined : (gs.schemaFor(world, name)[1] ?? own);
  const R = gs.readings(g, shared);
  const ids = [...g.nodes.keys()].filter((i) => ![...(g.nodes.get(i)?.[0] ?? [])].some((l) => hidden.has(l)));
  const drawn = new Set(ids);
  return {
    graph: name,
    boxes: ids.map((key) => ({ key, kind: [...(g.nodes.get(key)?.[0] ?? [])].filter((l) => !hidden.has(l)).sort(byCode).join(' · '), text: textOf(g, key) })),
    links: g.edges.filter(([s, , d]) => drawn.has(s) && drawn.has(d)).map(([from, type, to]) => ({ from, type, reading: gs.word(R, type), to })),
  };
}

/**
 * What a note's graph blocks draw, as built by the blocks up to and including block `upTo` (default: all of them).
 * Readings come from each graph's own schema anywhere in the note — a schema is written last — else the shared schema
 * it names, from `shared` (the vault's SCHEMA blocks). Problems are listed for the blocks up to `upTo`.
 */
export function readNote(blocks: string[], upTo = blocks.length - 1, shared: string[] = []): NoteReading {
  const upto = blocks.slice(0, upTo + 1);
  const { store, problems } = readBlocks(upto, shared);
  const world = gs.worldFromStore(store);
  const whole = upTo >= blocks.length - 1 ? world : gs.worldFromStore(readBlocks(blocks, shared).store);
  const graphs = new Map<string, GraphDrawing>();
  for (const name of Object.keys(world)) {
    const own = whole[name]?.labelled('ElementType').length ? whole[name] : undefined;
    graphs.set(name, drawingOf(world, name, own));
  }
  return { graphs, problems, world, texts: upto };
}
