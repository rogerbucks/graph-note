// Reading a note's data blocks for drawing, as far as they can be read (spec §3): a path that cannot be read is left out
// and listed as a problem, and the rest of its block is read; a comment after code, a comma with nothing after it, a
// missing comma and a link type without its colon are each read as meant, with a warning whose fix writes it so.
import gs from '@graph-note/graph-spec';
import { bareNames, items, lineAt, without } from './block-items.ts';
import type { Item } from './block-items.ts';
import { dataKind, graphOf } from './blocks.ts';
import type { Problem } from './note-reading.ts';

/**
 * Each comment after code on its line (§3: comments are whole lines, as // also occurs inside identifiers): the block
 * with them blanked, and for each a warning that names the rule, whose fix puts the comment on its own line.
 */
function lineEndComments(text: string): { text: string; problems: Omit<Problem, 'block' | 'graph'>[] } {
  const problems: Omit<Problem, 'block' | 'graph'>[] = [];
  const lines = text.split('\n').map((line, n) => {
    if (line.trim().startsWith('//')) return line;
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '\\') i++;
        else if (c === "'") quoted = false;
      } else if (c === "'") quoted = true;
      else if (c === '/' && line[i + 1] === '/' && line.slice(0, i).trim()) {
        const from = line.slice(0, i).replace(/\s+$/, '').length;
        problems.push({
          line: n + 1,
          severity: 'warning',
          message: gs.COMMENT_RULE,
          fix: gs.COMMENT_FIX,
          replace: { written: line.slice(from, i), with: ['\n'] },
          fixTitle: 'Put the comment on its own line',
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
 * A comma with nothing after it at a block's end, but blank lines and comments: the commonest state while the next
 * pattern is being typed, so never a failure of the block (8 Oct 2026). The block as read without it, and one warning
 * whose fix removes it; null when there is none.
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
      message: 'a comma with nothing after it; it is read as if it were not there',
      fix: 'remove the comma, or write the next pattern after it',
      replace: { written: ',', with: [''] },
      fixTitle: 'Remove the comma',
      span: { line: line - 1, character, end: character + 1 },
    },
  };
}

/**
 * Reads a note's data blocks, leaving out what cannot be read. Returns the blocks as read and the problems.
 * Each block is applied in order to a fresh store; when one fails, the item at the failing line is blanked and the
 * whole read starts again, so a half-applied block never leaves part of a bad path behind.
 */
export function readBlocks(texts: string[], shared: string[]): { store: gs.Store; problems: Problem[] } {
  const clean = texts.slice(),
    problems: Problem[] = [],
    skip = new Set<number>();
  texts.forEach((t, i) => {
    const k = dataKind(t);
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
