// What a note's graph blocks draw (spec §3) — the boxes and links of each graph, chosen as graph-spec-draw.py chooses
// them, so the core's layout source matches graph_svg.py's (spec §12). A graph with problems is still drawn: a path
// that cannot be read is left out, the rest of its block is drawn, and what was left out is listed as a problem.
import gs from '@graph-note/graph-spec';
import type { Graph, World } from '@graph-note/graph-spec';
import { estimate } from './estimates.ts';
import type { Estimate } from './estimates.ts';

export type { Estimate };

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

/** One graph, ready to draw: its boxes, its links, and the estimates added where what was written was a near miss. */
export interface GraphDrawing {
  graph: string;
  boxes: Box[];
  /** Every link as written, in order — what graph_svg.py draws. */
  links: Link[];
  /** Near misses drawn as guesses (spec §3): never written to the note. */
  estimates: Estimate[];
}

/** Something that could not be read: its graph, the block (index in the note), the line in that block (1 = its graph line), what is wrong, and the fix. */
export interface Problem {
  graph: string | null;
  block: number;
  line: number;
  message: string;
  fix: string;
  /** An error leaves something out of the drawing; a warning draws it, as an estimate. */
  severity: 'error' | 'warning';
  /** The text left out of the drawing, when a path or clause was. */
  dropped?: string;
  /** A word to change, and what it could be changed to — one fix each. */
  replace?: { written: string; with: string[] };
  /** Text to add, at a 0-based line and character of the block: the fix, as an edit. */
  insert?: { line: number; character: number; text: string };
  /** What the fix is called where it is offered, when "Change … to …" would not say it. */
  fixTitle?: string;
  /** Exactly where the word to change is: a 0-based line of the block, and the characters it spans on it. */
  span?: { line: number; character: number; end: number };
}

/** What a note's graph blocks say: each graph as drawn, the problems, and the graphs themselves, as written and joined. */
export interface NoteReading {
  graphs: Map<string, GraphDrawing>;
  problems: Problem[];
  /** The blocks as written, up to the one drawn. */
  texts: string[];
  /** The world as read, for checks and details. */
  world: World;
  /** The whole note's world, whose schemas lock a graph even when written after the block drawn (§5). */
  whole: World;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*gql\s*$/i;

/** A gql block's place in a note: its text (lines joined by \\n), the 0-based lines of its opening fence and of its closing one (the line count when unclosed). */
export interface Span {
  text: string;
  open: number;
  close: number;
}

/** Where each gql fenced block of a note is. An unclosed fence runs to the end, as Markdown reads it. */
export function gqlSpans(note: string): Span[] {
  const lines = note.split('\n').map((l) => l.replace(/\r$/, '')),
    out: Span[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i] ?? '');
    if (!open) continue;
    const mark = open[1] ?? '```',
      close = new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j] ?? '')) j++;
    out.push({ text: lines.slice(i + 1, j).join('\n'), open: i, close: j });
    i = j;
  }
  return out;
}

/** The gql fenced blocks of a note, in order, each with the note line (1-based) its fence opens on. */
export function gqlBlocks(note: string): Block[] {
  return gqlSpans(note).map((s) => ({ text: s.text, line: s.open + 1 }));
}

/** A top-level item of a block — one path, or one SET or MATCH clause — by its character span. */
interface Item {
  from: number;
  to: number;
  /** The comma that separates it from the next item, if any. */
  comma: number;
}

/** The top-level items of a block — each path, SET or MATCH — with the text and the 0-based lines each starts and ends on. */
export function blockItems(text: string): { text: string; line: number; end: number }[] {
  return items(text).map((it) => ({
    text: text.slice(it.from, it.to),
    line: lineAt(text, it.from) - 1,
    end: lineAt(text, it.to - 1) - 1,
  }));
}

/** The text with strings and comments blanked to spaces, so positions hold and words in them never match. */
const blankText = (text: string) =>
  text
    .replace(/'(?:[^'\\\n]|\\.)*'?/g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

/** Words as a list: "a", "a and b", "a, b and c". */
const listed = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * A schema whose types its GraphMeta does not declare (graph spec model §5: each ElementType is linked from the GraphMeta
 * by DECLARES) — as a graph locked by an earlier build is. One warning for each block that writes such types, on the
 * first, whose fix adds every DECLARES missing from that block, and a GraphMeta when the graph has none.
 */
function undeclared(whole: World, texts: string[]): Problem[] {
  const out: Problem[] = [];
  texts.forEach((text, block) => {
    const graph = graphOfBlock(text),
      g = graph ? whole[graph] : undefined;
    if (!graph || !g) return;
    const metas = g.labelled('GraphMeta');
    const declared = new Set(g.edges.filter(([s, t]) => t === 'DECLARES' && metas.includes(s)).map((e) => e[2]));
    const blanked = blankText(text);
    const missing = [...blanked.matchAll(/\(\s*([A-Za-z_]\w*)\s*((?::\s*[A-Za-z_]\w*\s*)+)/g)].filter(
      (m) => /:\s*ElementType\b/.test(m[2] ?? '') && g.nodes.has(m[1] ?? '') && !declared.has(m[1] ?? ''),
    );
    const first = missing[0];
    if (!first) return;
    const meta = metas.find((m) => /^[A-Za-z_]\w*$/.test(m)) ?? (metas.length ? null : `${graph}_schema`);
    const nameOf = (id: string) => {
      const { name } = g.p(id);
      return typeof name === 'string' ? name : id;
    };
    const names = listed(missing.map((m) => nameOf(m[1] ?? '')));
    const lines = text.split('\n'),
      last = lines.reduce((at, l, i) => (l.trim() && !l.trim().startsWith('//') ? i : at), 0);
    out.push({
      graph,
      block,
      line: blanked.slice(0, first.index).split('\n').length,
      severity: 'warning',
      message: metas.length
        ? `the schema does not declare ${names}: its GraphMeta must DECLARE each type (§5)`
        : `the schema has no GraphMeta to declare ${names}: each type must be declared (§5)`,
      fix: meta ? `add a DECLARES link from ${meta} to each` : 'link each type from the GraphMeta by DECLARES',
      ...(meta
        ? {
            insert: {
              line: last,
              character: (lines[last] ?? '').trimEnd().length,
              text:
                (metas.length ? '' : `,\n(${meta}:GraphMeta {graph: '${graph}', schema: '${graph}@1'})`) +
                missing.map((m) => `,\n(${meta})-[:DECLARES]->(${m[1]})`).join(''),
            },
            fixTitle: 'Declare each type',
          }
        : {}),
    });
  });
  return out;
}

/**
 * Where each link type written without its colon is in a block, in the order the reader reads them: its line, and the
 * characters its name spans. Strings and comments are blanked first, so words in them are never taken for one.
 */
function bareNames(text: string): { line: number; character: number; end: number }[] {
  const blanked = blankText(text);
  return [...blanked.matchAll(/-\[\s*([A-Za-z_]\w*)(?=\s*[\]{])/g)].map((m) => {
    const name = m[1] ?? '',
      at = (m.index ?? 0) + m[0].length - name.length,
      line = blanked.slice(0, at).split('\n').length - 1,
      character = at - (blanked.lastIndexOf('\n', at - 1) + 1);
    return { line, character, end: character + name.length };
  });
}

/** Splits a block into its top-level items: at commas outside brackets, strings and comments, and before SET, MATCH and INSERT. */
function items(text: string): Item[] {
  const out: Item[] = [];
  let depth = 0,
    start = -1,
    last = -1;
  const end = (comma: number) => {
    if (start !== -1) out.push({ from: start, to: last + 1, comma });
    start = -1;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (/\s/.test(c)) continue;
    if (depth === 0 && /[A-Za-z]/.test(c) && (i === 0 || !/\w/.test(text[i - 1] ?? ''))) {
      const w = /^[A-Za-z]+/.exec(text.slice(i))?.[0].toUpperCase();
      if ((w === 'SET' || w === 'MATCH' || w === 'INSERT') && start !== -1) end(-1);
    }
    if (c === ',' && depth === 0) {
      end(i);
      continue;
    }
    // a path closed at the end of one line and another opened on the next: a missing comma, so two items, for recovery
    if (c === '(' && depth === 0 && start !== -1 && text[last] === ')' && text.slice(last + 1, i).includes('\n'))
      end(-1);
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
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (chars[k] !== '\n') chars[k] = ' ';
  };
  for (const it of drop) {
    blank(it.from, it.to);
    const prior = all[all.indexOf(it) - 1];
    // keep its comma when the one before it is missing: it is then all that parts what came before from what comes after
    if (it.comma !== -1 && !(prior && prior.comma === -1 && !drop.includes(prior))) blank(it.comma, it.comma + 1);
    else {
      const before = all[all.indexOf(it) - 1];
      if (before && before.comma !== -1 && !drop.includes(before)) blank(before.comma, before.comma + 1);
    }
  }
  return chars.join('');
}

/** The graph a block names, or null. */
const graphOf = (text: string): string | null =>
  /^\s*\/\/\s*graph:\s*(\S+)/.exec(text.split('\n').find((l) => l.trim()) ?? '')?.[1] ?? null;

const isGraphLine = (text: string) => /^\s*\/\/\s*graph:/.test(text.split('\n').find((l) => l.trim()) ?? '');

/** The kind of a block, or null when it holds no data to draw: a query, an excerpt, a change set, or no graph line. */
function dataKind(text: string): 'data' | 'schema' | null | Problem {
  try {
    const [, kind] = gs.header(text);
    return kind === 'data' || kind === 'schema' ? kind : null;
  } catch (e) {
    if (!isGraphLine(text)) return null;
    const p = e instanceof gs.ProfileError ? e : null;
    return {
      graph: null,
      block: -1,
      severity: 'error',
      line: p?.line ?? 1,
      message: p?.msg ?? 'the graph line cannot be read',
      fix: p?.fix ?? "start the block with '// graph: <name>'",
    };
  }
}

const firstLine = (text: string) => text.split('\n').find((l) => l.trim()) ?? '';

/** Whether a block is a shared schema (§5): its graph line says SCHEMA and its name. */
export const isSharedSchema = (text: string): boolean => /^\s*\/\/\s*graph:.*·\s*SCHEMA\s+\S+/.test(firstLine(text));

/** Whether a block's graph is typed by a shared schema it names: its graph line says "schema" and the schema's name. */
export const namesSharedSchema = (text: string): boolean => /^\s*\/\/\s*graph:.*·\s*schema\s+\S+/.test(firstLine(text));

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
  const clean = texts.slice(),
    problems: Problem[] = [],
    skip = new Set<number>();
  texts.forEach((t, i) => {
    const k = dataKind(t);
    if (k === null) skip.add(i);
    else if (typeof k === 'object') {
      skip.add(i);
      problems.push({ ...k, block: i, graph: graphOf(t) });
    }
  });
  for (let attempt = 0; ; attempt++) {
    const store = new gs.Store();
    for (const s of shared) {
      try {
        store.apply(s);
      } catch {
        /* a shared schema that cannot be read types nothing */
      }
    }
    let failed: { block: number; error: unknown } | null = null;
    const commas: Problem[] = [];
    for (let i = 0; i < clean.length && !failed; i++) {
      if (skip.has(i)) continue;
      const before = store.commas.length;
      const bareBefore = store.bares.length;
      try {
        store.apply(clean[i] ?? '');
      } catch (error) {
        failed = { block: i, error };
      }
      // a comma the reader read in (§3): a warning on its line, whose fix adds it — the note itself is never rewritten unasked
      for (const c of store.commas.slice(before)) {
        const code = (clean[i] ?? '').split('\n')[c.line - 1] ?? '';
        commas.push({
          graph: c.graph,
          block: i,
          line: c.line,
          severity: 'warning',
          message: 'a comma is missing at the end of this line; it is read as if it were there',
          fix: 'add a comma at the end of the line',
          insert: { line: c.line - 1, character: code.trimEnd().length, text: ',' },
        });
      }
      // a type written without its colon, read as the graph's one type of that name (§3): a warning, whose fix writes
      // the colon and the type as the graph spells it
      const names = bareNames(clean[i] ?? '');
      for (const [k, b] of store.bares.slice(bareBefore).entries()) {
        commas.push({
          graph: b.graph,
          block: i,
          line: b.line,
          severity: 'warning',
          message: `[${b.written}] has no colon; it is read as the relationship type ${b.type}`,
          fix: `write it with its colon: [:${b.type}]`,
          replace: { written: b.written, with: [`:${b.type}`] },
          fixTitle: `Write the colon: [:${b.type}]`,
          ...(names[k] ? { span: names[k] } : {}),
        });
      }
    }
    if (!failed)
      return { store, problems: problems.concat(commas).sort((a, b) => a.block - b.block || a.line - b.line) };
    const { block, error } = failed,
      text = clean[block] ?? '';
    const pe = error instanceof gs.ProfileError ? error : null;
    const line = pe?.line ?? 1;
    const problem: Problem = {
      graph: graphOf(text),
      block,
      line,
      severity: 'error',
      message: pe?.msg ?? 'this could not be read',
      fix: pe?.fix ?? 'check the line against the guide to writing a graph note',
    };
    const all = items(text);
    // "unexpected '('" straight after a path that ends its line with no comma: say so, and offer the comma
    const opened = all.findIndex((it) => lineAt(text, it.from) === line),
      prior = all[opened - 1];
    if (pe?.msg === "unexpected '('" && prior && prior.comma === -1 && text[prior.to - 1] === ')') {
      const at = text.slice(0, prior.to).split('\n'),
        lastLine = (at[at.length - 1] ?? '').trim();
      problem.message = `${pe.msg} — a comma is missing at the end of the line before`;
      problem.fix = `add a comma at the end of the line before, after ${lastLine}`;
      problem.insert = { line: at.length - 1, character: (at[at.length - 1] ?? '').length, text: ',' };
    }
    const touching = all.filter((it) => lineAt(text, it.from) <= line && line <= lineAt(text, it.to - 1));
    const before = all.filter((it) => lineAt(text, it.from) <= line).pop();
    const drop = touching.length ? touching : before ? [before] : [];
    if (!drop.length || attempt > texts.length + all.length * 2) {
      skip.add(block);
      problems.push(problem);
      continue;
    }
    // Of several items on the failing line, leave out only the one at fault when that can be told.
    let chosen = drop;
    if (drop.length > 1) {
      chosen = [
        drop.find((it) => {
          const trial = without(text, all, [it]);
          try {
            const s = new gs.Store();
            s.apply(trial);
            return true;
          } catch (e) {
            return !(e instanceof gs.ProfileError && e.line === line);
          }
        }) ?? drop[0],
      ].filter((x): x is Item => !!x);
      if (!chosen.length) chosen = drop;
    }
    clean[block] = without(text, all, chosen);
    problems.push({ ...problem, dropped: chosen.map((it) => text.slice(it.from, it.to)).join('\n') });
  }
}

/** A thing's text: its name, else its title, text or label, else its id — as graph-spec-draw.py chooses. */
function textOf(g: Graph, id: string): string {
  const p = g.p(id);
  for (const k of ['name', 'title', 'text', 'label']) {
    const v = p[k];
    if (typeof v === 'string' && v) return v;
  }
  return id;
}

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function drawingOf(world: World, name: string, own: Graph | undefined): GraphDrawing {
  const g = world[name] as Graph;
  const hidden = new Set(gs.SCHEMA_LABELS);
  const shared = g.labelled('ElementType').length ? undefined : (gs.schemaFor(world, name)[1] ?? own);
  const readings = gs.readings(g, shared);
  const ids = [...g.nodes.keys()].filter((i) => ![...(g.nodes.get(i)?.[0] ?? [])].some((l) => hidden.has(l)));
  const drawn = new Set(ids);
  return {
    graph: name,
    boxes: ids.map((key) => ({
      key,
      kind: [...(g.nodes.get(key)?.[0] ?? [])]
        .filter((l) => !hidden.has(l))
        .sort(byCode)
        .join(' · '),
      text: textOf(g, key),
    })),
    links: g.edges
      .filter(([s, , d]) => drawn.has(s) && drawn.has(d))
      .map(([from, type, to]) => ({ from, type, reading: gs.word(readings, type), to })),
    estimates: [],
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
    const d = drawingOf(world, name, own);
    const shared = (world[name] as Graph).labelled('ElementType').length
      ? undefined
      : (gs.schemaFor(world, name)[1] ?? own);
    d.estimates = estimate(world[name] as Graph, name, d, shared, problems, upto);
    graphs.set(name, d);
  }
  problems.push(...undeclared(whole, upto));
  return { graphs, problems, world, whole, texts: upto };
}
