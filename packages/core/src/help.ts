// Help that finds and fixes problems (spec §8), written in the shapes of the Language Server Protocol (spec §10). Those
// are ranges, diagnostics, code actions with text edits and completion items. So a VS Code host can show them as its
// own, and the Obsidian pane shows them in place. Positions are 0-based lines and characters within the block being
// edited.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import { blockItems } from './block-items.ts';
import type { GraphDrawing, NoteReading, Problem } from './note-reading.ts';
import { distance, hops } from './estimates.ts';
import { tokenize } from './tokens.ts';

/** LSP DiagnosticSeverity. */
export const SEVERITY = { Error: 1, Warning: 2, Information: 3, Hint: 4 } as const;
/** LSP CompletionItemKind: names are variables, kinds are classes, relationships are interfaces. */
export const KIND = { Variable: 6, Class: 7, Interface: 8 } as const;

/** A place in a block, as the Language Server Protocol counts it: a 0-based line, and a character on it. */
export interface Position {
  line: number;
  character: number;
}
/** A stretch of a block, from one position up to another (LSP). */
export interface Range {
  start: Position;
  end: Position;
}
/** Text to put in place of a range (LSP). */
export interface TextEdit {
  range: Range;
  newText: string;
}
/** A fix offered for a problem: its title, and the edits that make it (LSP). */
export interface CodeAction {
  title: string;
  kind: 'quickfix';
  isPreferred?: boolean;
  edit: { changes: Record<string, TextEdit[]> };
}
/** A problem in a block, where it is, how bad, and the fixes for it (LSP). */
export interface Diagnostic {
  range: Range;
  severity: (typeof SEVERITY)[keyof typeof SEVERITY];
  code?: string;
  source: 'thoughtknot';
  message: string;
  /** The fix in words, and the fixes that can be applied as edits. */
  data: { fix: string; fixes: CodeAction[] };
}
/** A suggestion while typing: the word, what kind it is, a line about it, and what goes in (LSP). */
export interface CompletionItem {
  label: string;
  kind: (typeof KIND)[keyof typeof KIND];
  detail?: string;
  /** What choosing it writes, when that is not the label — a type or kind with its colon. */
  insertText?: string;
  /** Where what it writes starts, when not where the list's own `from` is. */
  from?: number;
}

const sentence = (s: string, keepCase = false) => {
  const t = s.trim();
  return (keepCase ? t : t.charAt(0).toUpperCase() + t.slice(1)).replace(/([^.!?])$/, '$1.');
};
const wordRe = (w: string) =>
  new RegExp(`(^|[^A-Za-z0-9_])(${w.replace(/[^A-Za-z0-9_]/g, '\\$&')})(?![A-Za-z0-9_])`, 'g');

/** Where a word is on a line of the block, or the whole line, trimmed, when the word cannot be found. */
function rangeOf(text: string, line: number, word?: string): Range {
  const l = text.split('\n')[line] ?? '';
  if (word) {
    const m = wordRe(word).exec(l);
    if (m) {
      const c = m.index + (m[1] ?? '').length;
      return { start: { line, character: c }, end: { line, character: c + word.length } };
    }
  }
  const start = l.length - l.trimStart().length,
    end = l.trimEnd().length;
  return { start: { line, character: start }, end: { line, character: Math.max(end, start + 1) } };
}

/** The graph's own schema, or the shared one it names: its node and edge types, or null for a draft. */
function schemaOf(
  reading: NoteReading,
  graph: string,
): { kinds: string[]; types: Map<string, string | undefined> } | null {
  const g = reading.world[graph];
  if (!g) return null;
  let s: Graph | undefined = g.labelled('ElementType').length ? g : gs.schemaFor(reading.world, graph)[1];
  if (!s) {
    // a schema written later in the note still locks the graph (§5): readNote read the whole note for readings
    if (!reading.whole[graph]?.labelled('ElementType').length) return null;
    s = reading.whole[graph];
  }
  if (!s) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const elementTypes = s.labelled('ElementType').map((i) => s.p(i));
  return {
    kinds: elementTypes
      .filter((t) => t.kind === 'node')
      .flatMap((t) => str(t.name) ?? [])
      .sort(),
    types: new Map(
      elementTypes
        .filter((t) => t.kind === 'edge')
        .flatMap((t) => {
          const n = str(t.name);
          return n ? [[n, str(t.reading)] as const] : [];
        }),
    ),
  };
}

/** Each problem of one block, as an LSP diagnostic with its place and its fixes. */
export function diagnostics(
  reading: NoteReading,
  graph: string,
  block: number,
  text: string,
  uri: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const own = reading.problems.filter((p: Problem) => p.graph === graph && p.block === block);
  for (const p of own) {
    const line = p.line - 1,
      range = p.span
        ? {
            start: { line: p.span.line, character: p.span.character },
            end: { line: p.span.line, character: p.span.end },
          }
        : rangeOf(text, line, p.replace?.written);
    const add = p.insert;
    const inserts: CodeAction[] = add
      ? [
          {
            title: p.fixTitle ?? 'Add the missing comma',
            kind: 'quickfix',
            isPreferred: true,
            edit: {
              changes: {
                [uri]: [
                  {
                    range: {
                      start: { line: add.line, character: add.character },
                      end: { line: add.line, character: add.character },
                    },
                    newText: add.text,
                  },
                ],
              },
            },
          },
        ]
      : [];
    const fixes: CodeAction[] = inserts.concat(
      (p.replace?.with ?? []).map((w) => ({
        title: p.fixTitle ?? `Change ${p.replace?.written} to ${w}`,
        kind: 'quickfix',
        isPreferred: p.replace?.with.length === 1,
        // with any further edits the fix makes as one change, such as the later steps of a path numbered again
        edit: {
          changes: {
            [uri]: [
              { range, newText: w },
              ...(p.also ?? []).map((e) => ({
                range: {
                  start: { line: e.span.line, character: e.span.character },
                  end: { line: e.span.line, character: e.span.end },
                },
                newText: e.text,
              })),
            ],
          },
        },
      })),
    );
    out.push({
      range,
      severity: p.severity === 'warning' ? SEVERITY.Warning : p.severity === 'hint' ? SEVERITY.Hint : SEVERITY.Error,
      // the reader's stable code, the same from both libraries (editor spec §42, problem_codes)
      ...(p.code ? { code: p.code } : {}),
      source: 'thoughtknot',
      message: sentence(p.message, !!p.replace && p.message.startsWith(p.replace.written)),
      data: { fix: sentence(p.fix), fixes },
    });
  }
  // in a draft, a kind one or two letters from a kind written more often is warned of (§8)
  const d = reading.graphs.get(graph);
  if (d && !schemaOf(reading, graph)) {
    const count = new Map<string, number>();
    for (const b of d.boxes) for (const k of b.kind.split(' · ').filter(Boolean)) count.set(k, (count.get(k) ?? 0) + 1);
    const lines = text.split('\n');
    for (const [k, n] of count) {
      const near = [...count]
        .filter(([u, m]) => u !== k && m > n && distance(k, u) <= 2)
        .sort((a, b) => distance(k, a[0]) - distance(k, b[0]));
      const u = near[0]?.[0];
      if (!u || (near[1] && distance(k, near[1][0]) === distance(k, u))) continue;
      const dist = distance(k, u);
      lines.forEach((l, line) => {
        if (!new RegExp(`:\\s*${k}\\b`).test(l.replace(/\/\/.*$/, ''))) return;
        const range = rangeOf(text, line, k);
        out.push({
          range,
          severity: SEVERITY.Warning,
          code: 'near-duplicate',
          source: 'thoughtknot',
          message: `The kind ${k} is ${dist === 1 ? 'one letter' : 'two letters'} from ${u}, already in the graph.`,
          data: {
            fix: `Change ${k} to ${u}, or keep ${k} if it is a new kind.`,
            fixes: [
              {
                title: `Change ${k} to ${u}`,
                kind: 'quickfix',
                isPreferred: true,
                edit: { changes: { [uri]: [{ range, newText: u }] } },
              },
            ],
          },
        });
      });
    }
  }
  return out.sort(
    (a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character,
  );
}

/** What to suggest at a place in the block: names, kinds or relationships already in the graph — only the schema's when it is locked. */
export function completions(
  reading: NoteReading,
  graph: string,
  text: string,
  offset: number,
): { from: number; items: CompletionItem[] } {
  const before = text.slice(0, offset),
    none = { from: offset, items: [] };
  const last = tokenize(before).pop();
  if (
    last &&
    (last.c === 'comment' || (last.c === 'string' && (last.s.length < 2 || last.s[last.s.length - 1] !== last.s[0])))
  )
    return none;
  const d = reading.graphs.get(graph),
    schema = schemaOf(reading, graph);
  if (!d) return none;
  const starts = (p: string) => (s: string) => s.toLowerCase().startsWith(p.toLowerCase());
  let m: RegExpExecArray | null;
  // a relationship brings its colon (spec §4): after -[ the types are offered as :TYPE
  if ((m = /-\[\s*(\w*)$/.exec(before))) {
    const p = m[1] ?? '';
    const types = schema ? [...schema.types.keys()] : [...new Set(d.links.map((l) => l.type))];
    const readingOf = (t: string) => schema?.types.get(t) ?? d.links.find((l) => l.type === t)?.reading;
    return {
      from: offset - p.length,
      items: types
        .filter(starts(p))
        .sort()
        .map((t) => ({
          label: t,
          kind: KIND.Interface,
          detail: readingOf(t) ?? t.replace(/_/g, ' ').toLowerCase(),
          insertText: `:${t}`,
        })),
    };
  }
  if ((m = /-\[\s*:\s*(\w*)$/.exec(before))) {
    const p = m[1] ?? '';
    const types = schema ? [...schema.types.keys()] : [...new Set(d.links.map((l) => l.type))];
    const readingOf = (t: string) => schema?.types.get(t) ?? d.links.find((l) => l.type === t)?.reading;
    return {
      from: offset - p.length,
      items: types
        .filter(starts(p))
        .sort()
        .map((t) => ({ label: t, kind: KIND.Interface, detail: readingOf(t) ?? t.replace(/_/g, ' ').toLowerCase() })),
    };
  }
  if ((m = /\(\s*\w+\s*:\s*(?:\w+\s*:\s*)*(\w*)$/.exec(before))) {
    const p = m[1] ?? '';
    const kinds = schema ? schema.kinds : [...new Set(d.boxes.flatMap((b) => b.kind.split(' · ').filter(Boolean)))];
    return {
      from: offset - p.length,
      items: kinds
        .filter(starts(p))
        .sort()
        .map((k) => ({ label: k, kind: KIND.Class })),
    };
  }
  if ((m = /\(\s*(\w*)$/.exec(before))) {
    const p = m[1] ?? '';
    // a thing drawn under a suggested name is not offered: taking it would write the name without its fix (§4)
    const names: CompletionItem[] = d.boxes
      .filter((b) => starts(p)(b.key) && !b.suggested)
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map((b) => ({ label: b.key, kind: KIND.Variable, detail: b.kind ? `${b.kind}: ${b.text}` : b.text }));
    // a kind brings its colon (spec §4). After a new thing's name, the kinds are offered as :Kind, added after the
    // name. But that is only once the name can be nothing but a new thing. While it may still be a reference, the names
    // come alone
    const kinds =
      p && !names.length
        ? (schema ? schema.kinds : [...new Set(d.boxes.flatMap((b) => b.kind.split(' · ').filter(Boolean)))])
            .sort()
            .map((k) => ({ label: k, kind: KIND.Class, insertText: `:${k}`, from: offset }))
        : [];
    return { from: offset - p.length, items: names.concat(kinds) };
  }
  return none;
}

const article = (k: string) => (/^[aeiou]/i.test(k) ? 'an' : 'a');

/** Each pattern of the block read back in plain language, by the 0-based line it ends on: what it writes, in the graph's words. */
export function readBack(reading: NoteReading, graph: string, text: string): Map<number, string> {
  const d = reading.graphs.get(graph),
    out = new Map<number, string>();
  // each box's text found by its key from a map, not by a search of every box for every line (§9: never freeze)
  const texts = new Map<string, string>();
  for (const b of d?.boxes ?? []) if (!texts.has(b.key)) texts.set(b.key, b.text);
  const textOf = (k: string) => texts.get(k) ?? `${k} (not in the graph)`;
  // a link reads in its type's own words, from its schema. A type with none — a draft's, or one the schema does not
  // declare — shows itself, as an arrow. It is never a guess at words that may read badly ("Drive hope Sydney")
  const whole = reading.whole[graph] ?? reading.world[graph];
  const own = whole
    ? gs.readings(whole, whole.labelled('ElementType').length ? undefined : gs.schemaFor(reading.whole, graph)[1])
    : new Map<string, [string | undefined, string | undefined]>();
  const wordsOf = (t: string) => own.get(t)?.[0];
  const words = (t: string) => {
    const taken = d?.estimates.find((e) => e.kind === 'type' && e.written === t)?.type;
    return wordsOf(t) ?? (taken ? wordsOf(taken) : undefined) ?? `—${t}→`;
  };
  for (const it of blockItems(text)) {
    let said: string | null = null;
    const set = /^SET\s+(\w+)\.(\w+)\s*=\s*([\s\S]+)$/i.exec(it.text.trim());
    if (set) said = `${textOf(set[1] ?? '')}: ${set[2]} is ${(set[3] ?? '').trim().replace(/^'([\s\S]*)'$/, '$1')}`;
    else {
      const hs = hops(it.text);
      if (hs.length) said = hs.map(([s, t, e]) => `${textOf(s)} ${words(t)} ${textOf(e)}`).join('; ');
      else {
        const node = /^\(\s*(\w+)\s*:\s*([\w:]+)/.exec(it.text.trim());
        if (node) {
          const kind = (node[2] ?? '').split(':').filter((k) => !gs.SCHEMA_LABELS.includes(k))[0];
          if (kind) said = `${textOf(node[1] ?? '')} is ${article(kind)} ${kind}`;
        }
      }
    }
    if (said) out.set(it.end, out.has(it.end) ? `${out.get(it.end)}; ${said}` : said); // beside the pattern's last line
  }
  return out;
}

/** The graph as sentences, for screen readers (spec §11): a summary, every thing, every link, and every guess said to be one. */
export function textVersion(d: GraphDrawing): string[] {
  const textOf = (k: string) => d.boxes.find((b) => b.key === k)?.text ?? k;
  const guessed = new Set(d.estimates.filter((e) => e.kind === 'type').map((e) => e.index));
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return [
    `Graph ${d.graph}: ${plural(d.boxes.length, 'thing')}, ${plural(d.links.length, 'link')}.`,
    ...d.boxes.map((b) => (b.kind ? `${b.text} is ${article(b.kind)} ${b.kind}.` : `${b.text}.`)),
    ...d.links.filter((_, i) => !guessed.has(i)).map((l) => `${textOf(l.from)} ${l.reading} ${textOf(l.to)}.`),
    ...d.estimates.map((e) => `Estimated, not written: ${textOf(e.from)} ${e.reading} ${textOf(e.to)}.`),
  ];
}
