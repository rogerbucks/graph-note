// Reading a note's data blocks for drawing, as far as they can be read (spec §3). A path that cannot be read is left
// out and listed as a problem, and the rest of its block is read. Some slips are each read as meant, with a warning
// whose fix writes it so. They are a comment after code, a comma with nothing after it and a missing comma. So are a
// link type without its colon and a thing with text but no name.
import gs from '@thoughtknot/graph-spec';
import { bareNames, items, lineIndex, without } from './block-items.ts';
import type { Item } from './block-items.ts';
import { dataKind, graphOf } from './blocks.ts';
import { nameGaps, withNames } from './name-gaps.ts';
import { keepValues, readerValues, readerWords } from './reader-words.ts';
import type { BlockGaps } from './name-gaps.ts';
import type { Problem } from './note-reading.ts';
import { trim, trimEnd } from './whitespace.ts';
import { THRESHOLDS } from './thresholds.ts';
import { word } from './words.ts';

/**
 * Each comment after code on its line. §3 says comments are whole lines, as // also occurs inside identifiers. The
 * block comes back with them blanked, with a warning for each. The warning names the rule, and its fix puts the
 * comment on its own line.
 */
function lineEndComments(text: string): { text: string; problems: Omit<Problem, 'block' | 'graph'>[] } {
  const problems: Omit<Problem, 'block' | 'graph'>[] = [];
  const lines = text.split('\n').map((line, n) => {
    if (trim(line).startsWith('//')) return line;
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '\\') i++;
        else if (c === "'") quoted = false;
      } else if (c === "'") quoted = true;
      else if (c === '/' && line[i + 1] === '/' && trim(line.slice(0, i))) {
        const from = trimEnd(line.slice(0, i)).length;
        problems.push({
          line: n + 1,
          severity: 'warning',
          message: gs.COMMENT_RULE,
          code: 'GN103',
          fix: gs.COMMENT_FIX,
          replace: { written: line.slice(from, i), with: ['\n'] },
          fixTitle: word('reading.comment-own-line.fix-title'),
          span: { line: n, character: from, end: i },
        });
        return line.slice(0, i) + ' '.repeat(line.length - i);
      }
    }
    return line;
  });
  return { text: lines.join('\n'), problems };
}

/**
 * A comma with nothing after it at a block's end, but blank lines and comments. It is the commonest state while the
 * next pattern is being typed, so never a failure of the block (8 Oct 2026). Returns the block as read without it,
 * and one warning whose fix removes it; null when there is none.
 */
function danglingComma(text: string): { text: string; problem: Omit<Problem, 'block' | 'graph'> } | null {
  const last = items(text).pop();
  if (!last || last.comma === -1) return null;
  const at = last.comma,
    before = text.slice(0, at).split('\n'),
    line = before.length,
    character = (before[before.length - 1] ?? '').length;
  return {
    text: text.slice(0, at) + ' ' + text.slice(at + 1),
    problem: {
      line,
      severity: 'warning',
      message: word('reading.comma-trailing'),
      code: 'GN701',
      fix: word('reading.comma-trailing.fix'),
      replace: { written: ',', with: [''] },
      fixTitle: word('reading.comma-trailing.fix-title'),
      span: { line: line - 1, character, end: character + 1 },
      departure: 'trailing-comma',
    },
  };
}

/** The blocks made ready to read: as they will be read, the problems found so far, those left out, and their gaps. */
export interface Prepared {
  clean: string[];
  problems: Problem[];
  skip: Set<number>;
  gaps: BlockGaps[];
}

/**
 * A block as read, every line where it was written. It has three parts:
 * - `named`: with what `prepare` read as meant and the suggested names put in.
 * - `applied`: the same with whatever could not be read left out, as the store took it. It is null for a block left
 *   out whole.
 * - `dropped`: the 1-based line each item left out begins on, every item of a block left out whole.
 * Notes are read from these (notes.ts). So a thing drawn under a suggested name keeps its note, and a note on what was
 * left out is said.
 */
export interface ReadText {
  named: string;
  applied: string | null;
  dropped: number[];
}

/** Which blocks are read, and as what: `dataKind`, or, for the style graph (style.ts), its style blocks read as data. */
export type KindOf = (text: string) => ReturnType<typeof dataKind>;

/**
 * The blocks made ready to read. A block that is not data is left out. A comment after code is blanked and a comma
 * with nothing after it is taken out, each with its warning. Names are suggested for things written without one.
 * `kindOf` says which blocks are read: the data blocks, unless another reader, such as the style graph's, asks for its
 * own.
 */
export function prepare(texts: string[], kindOf: KindOf = dataKind): Prepared {
  const clean = texts.slice(),
    problems: Problem[] = [],
    skip = new Set<number>();
  texts.forEach((t, i) => {
    const k = kindOf(t);
    if (k === null) skip.add(i);
    else if (typeof k === 'object') {
      skip.add(i);
      problems.push({ ...k, block: i, graph: graphOf(t) });
    } else {
      const comments = lineEndComments(t);
      clean[i] = comments.text;
      problems.push(...comments.problems.map((p) => ({ ...p, block: i, graph: graphOf(t) })));
      const dangling = danglingComma(clean[i] ?? t);
      if (dangling) {
        clean[i] = dangling.text;
        problems.push({ ...dangling.problem, block: i, graph: graphOf(t) });
      }
    }
  });
  // a thing given text but no name, or a name but no text: a warning whose fix adds what is suggested. The suggested
  // name is only read in, in a copy, so that the thing is drawn — the note itself is never rewritten unasked
  const gaps = nameGaps(clean.map((text, i) => ({ text: skip.has(i) ? '' : text, graph: graphOf(texts[i] ?? '') })));
  gaps.forEach((g, i) => problems.push(...g.problems.map((p) => ({ ...p, block: i, graph: graphOf(texts[i] ?? '') }))));
  return { clean, problems, skip, gaps };
}

/**
 * How much may be read again, in UTF-16 units, while a block's parts that cannot be read are left out one by one.
 * Each is the block read again whole, and so is each trial to tell which of several parts on a line is at fault. Past
 * it, the rest of the block from the failing line is left out at once (§9: never freeze). A million is under half a
 * second of re-reading on a desktop. A note of ordinary size, with a few dozen problems, never comes near it. The
 * Python reader (graphspec/reader/drawing.py) counts and cuts exactly so, so both draw the same (§12, drawn_in_part).
 */
export const REREAD_BUDGET = THRESHOLDS.reread_budget.value;

/** The 0-based line of a character, by a block's line index. */
type LineOf = (pos: number) => number;

/** The warnings for what the reader read in as meant in block `i`: missing commas, and types without their colon. */
function readAsMeant(store: gs.Store, i: number, text: string, commasFrom: number, baresFrom: number): Problem[] {
  const out: Problem[] = [];
  // a comma the reader read in (§3): a warning on its line, whose fix adds it — the note itself is never rewritten unasked
  const lines = store.commas.length > commasFrom ? text.split('\n') : [];
  for (const c of store.commas.slice(commasFrom)) {
    const code = lines[c.line - 1] ?? '';
    out.push({
      graph: c.graph,
      block: i,
      line: c.line,
      severity: 'warning',
      message: word('reading.comma-missing'),
      code: 'GN702',
      fix: word('reading.comma-missing.fix'),
      insert: { line: c.line - 1, character: trimEnd(code).length, text: ',' },
      departure: 'missing-comma',
    });
  }
  // a type written without its colon, read as the graph's one type of that name (§3). It gets a warning, whose fix
  // writes the colon and the type as the graph spells it
  const bares = store.bares.slice(baresFrom);
  const names = bares.length ? bareNames(text) : [];
  for (const [k, b] of bares.entries()) {
    out.push({
      graph: b.graph,
      block: i,
      line: b.line,
      severity: 'warning',
      message: word('reading.bare-type', { written: b.written, type: b.type }),
      code: 'GN703',
      fix: word('reading.bare-type.fix', { type: b.type }),
      replace: { written: b.written, with: [`:${b.type}`] },
      fixTitle: word('reading.bare-type.fix-title', { type: b.type }),
      ...(names[k] ? { span: names[k] } : {}),
      departure: 'bare-type',
    });
  }
  return out;
}

/** What is said of a block that failed: the error, with "a comma is missing" said when that is why. */
function failure(block: number, text: string, error: unknown, all: Item[], lineAt: LineOf): Problem {
  const pe = error instanceof gs.ProfileError ? error : null;
  const line = pe?.line ?? 1;
  const said = pe ? readerWords(pe) : null;
  const problem: Problem = {
    graph: graphOf(text),
    block,
    line,
    severity: 'error',
    message: said?.message ?? word('reading.unreadable'),
    fix: said?.fix ?? word('reading.unreadable.fix'),
    code: pe?.code ?? 'GN706',
  };
  // an escape GQL does not name (req:3.gql-escapes): the reader says where its backslash is, and the fix doubles it
  if (typeof pe?.at === 'number') {
    problem.insert = { line: line - 1, character: pe.at, text: '\\' };
    problem.fixTitle = word('reading.escape.fix-title');
  }
  // an unexpected '(' (GN210) straight after a path that ends its line with no comma: say so, and offer the comma
  const opened = all.findIndex((it) => lineAt(it.from) === line),
    prior = all[opened - 1];
  const opens = pe?.code === 'GN210' && readerValues(pe)?.token === '(';
  if (opens && prior && prior.comma === -1 && text[prior.to - 1] === ')') {
    const at = text.slice(0, prior.to).split('\n'),
      lastLine = trim(at[at.length - 1] ?? '');
    problem.message = word('reading.comma-missing-before', { message: problem.message });
    problem.fix = word('reading.comma-missing-before.fix', { line: lastLine });
    problem.insert = { line: at.length - 1, character: (at[at.length - 1] ?? '').length, text: ',' };
  }
  if (pe) keepValues(problem, pe);
  return problem;
}

/**
 * Reads a note's data blocks, leaving out what cannot be read. Returns the blocks as read and the problems.
 * Each block is applied in order. When one fails, the store is as it was before it: a block is applied whole or not
 * at all. Then the item at the failing line is blanked, and that block is read again. This matches a fresh read of
 * every block, as the Python reader does it, without reading the blocks before it again. `budget` caps the re-reading
 * (above). `kindOf` says which blocks are read (`prepare`): the data blocks by default. Only the blocks up to `upTo`
 * are read and have their problems listed, as for a card drawn from the blocks up to its own. But names are suggested
 * against every block. So a card, the whole note and every edit agree on a thing's suggested name
 * (suggested_name_unique).
 */
export function readBlocks(
  texts: string[],
  shared: string[],
  budget = REREAD_BUDGET,
  kindOf: KindOf = dataKind,
  upTo = texts.length - 1,
): { store: gs.Store; problems: Problem[]; read: Map<number, ReadText> } {
  const { clean, problems, skip, gaps } = prepare(texts, kindOf);
  const read = new Map<number, ReadText>();
  const store = new gs.Store();
  for (const s of shared) {
    try {
      store.apply(s);
    } catch {
      /* a shared schema that cannot be read types nothing */
    }
  }
  const meant: Problem[] = [];
  let attempt = 0,
    spent = 0;
  for (let block = 0; block < Math.min(clean.length, upTo + 1); block++) {
    if (skip.has(block)) continue;
    // every change made to a block keeps its line breaks where they were, so its lines are indexed once
    const lineAt = lineIndex(texts[block] ?? '');
    const named = withNames(clean[block] ?? '', gaps[block]?.named ?? []);
    const dropped = new Set<number>();
    const leaveOut = (cut: Item[]) => cut.forEach((it) => dropped.add(lineAt(it.from)));
    const lines = () => [...dropped].sort((a, b) => a - b);
    for (;;) {
      const text = clean[block] ?? '',
        commasFrom = store.commas.length,
        baresFrom = store.bares.length;
      try {
        store.apply(withNames(text, gaps[block]?.named ?? []));
      } catch (error) {
        const all = items(text);
        const problem = failure(block, text, error, all, lineAt);
        const line = problem.line;
        const touching = all.filter((it) => lineAt(it.from) <= line && line <= lineAt(it.to - 1));
        const before = all.filter((it) => lineAt(it.from) <= line).pop();
        const drop = touching.length ? touching : before ? [before] : [];
        const given = attempt++ > texts.length + all.length * 2; // a block that will not settle is left out whole
        if (!drop.length || given) {
          skip.add(block);
          problems.push(problem);
          leaveOut(all);
          read.set(block, { named, applied: null, dropped: lines() });
          break;
        }
        // each read again of the block, and each trial of it, is charged to the budget; past it, the rest is cut
        const cost = text.length;
        let over = false,
          chosen = drop;
        if (drop.length > 1) {
          // of several items on the failing line, leave out only the one at fault when that can be told
          let found: Item | undefined;
          for (const it of drop) {
            if (spent + cost > budget) {
              over = true;
              break;
            }
            spent += cost;
            try {
              new gs.Store().apply(without(text, all, [it]));
              found = it;
            } catch (e) {
              if (!(e instanceof gs.ProfileError && e.line === line)) found = it;
            }
            if (found) break;
          }
          chosen = [found ?? (drop[0] as Item)];
        }
        if (!over && spent + cost > budget) over = true;
        else if (!over) spent += cost;
        let comma = -1;
        if (over) {
          const first = (drop[0] as Item).from;
          chosen = all.filter((it) => it.from >= first);
          problem.message = word('reading.too-much-unread', { message: problem.message });
          // the comma before what is left out would end the block with nothing after it
          comma = all.filter((it) => it.from < first).pop()?.comma ?? -1;
        }
        leaveOut(chosen);
        const cut = without(text, all, chosen);
        clean[block] = comma === -1 ? cut : `${cut.slice(0, comma)} ${cut.slice(comma + 1)}`;
        const left = { ...problem, dropped: chosen.map((it) => text.slice(it.from, it.to)).join('\n') };
        if (error instanceof gs.ProfileError) keepValues(left, error);
        problems.push(left);
        continue;
      }
      meant.push(...readAsMeant(store, block, text, commasFrom, baresFrom));
      read.set(block, { named, applied: withNames(text, gaps[block]?.named ?? []), dropped: lines() });
      break;
    }
  }
  const listed = problems.concat(meant).filter((p) => p.block <= upTo);
  return { store, problems: listed.sort((a, b) => a.block - b.block || a.line - b.line), read };
}
