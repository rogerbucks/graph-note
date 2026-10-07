// Help that finds and fixes problems (spec §8), written in the shapes of the Language Server Protocol (spec §10) — ranges,
// diagnostics, code actions with text edits, completion items — so a VS Code host can show them as its own, and the
// Obsidian pane shows them in place. Positions are 0-based lines and characters within the block being edited.
import gs from '@graph-note/graph-spec';
import type { Graph } from '@graph-note/graph-spec';
import { blockItems } from './drawing.ts';
import type { GraphDrawing, NoteReading, Problem } from './drawing.ts';
import { distance, hops } from './estimates.ts';
import { tokenize } from './tokens.ts';

/** LSP DiagnosticSeverity. */
export const SEVERITY = { Error: 1, Warning: 2, Information: 3, Hint: 4 } as const;
/** LSP CompletionItemKind: names are variables, kinds are classes, relationships are interfaces. */
export const KIND = { Variable: 6, Class: 7, Interface: 8 } as const;

export interface Position { line: number; character: number }
export interface Range { start: Position; end: Position }
export interface TextEdit { range: Range; newText: string }
export interface CodeAction {
  title: string;
  kind: 'quickfix';
  isPreferred?: boolean;
  edit: { changes: Record<string, TextEdit[]> };
}
export interface Diagnostic {
  range: Range;
  severity: (typeof SEVERITY)[keyof typeof SEVERITY];
  code?: string;
  source: 'graph-note';
  message: string;
  /** The fix in words, and the fixes that can be applied as edits. */
  data: { fix: string; fixes: CodeAction[] };
}
export interface CompletionItem {
  label: string;
  kind: (typeof KIND)[keyof typeof KIND];
  detail?: string;
}

const sentence = (s: string, keepCase = false) => {
  const t = s.trim();
  return (keepCase ? t : t.charAt(0).toUpperCase() + t.slice(1)).replace(/([^.!?])$/, '$1.');
};
const wordRe = (w: string) => new RegExp(`(^|[^A-Za-z0-9_])(${w.replace(/[^A-Za-z0-9_]/g, '\\$&')})(?![A-Za-z0-9_])`, 'g');

/** Where a word is on a line of the block, or the whole line, trimmed, when the word cannot be found. */
function rangeOf(text: string, line: number, word?: string): Range {
  const l = text.split('\n')[line] ?? '';
  if (word) {
    const m = wordRe(word).exec(l);
    if (m) { const c = m.index + (m[1] ?? '').length; return { start: { line, character: c }, end: { line, character: c + word.length } }; }
  }
  const start = l.length - l.trimStart().length, end = l.trimEnd().length;
  return { start: { line, character: start }, end: { line, character: Math.max(end, start + 1) } };
}

/** The graph's own schema, or the shared one it names: its node and edge types, or null for a draft. */
function schemaOf(reading: NoteReading, graph: string): { kinds: string[]; types: Map<string, string | undefined> } | null {
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
  const T = s.labelled('ElementType').map((i) => s.p(i));
  return {
    kinds: T.filter((t) => t.kind === 'node').flatMap((t) => str(t.name) ?? []).sort(),
    types: new Map(T.filter((t) => t.kind === 'edge').flatMap((t) => { const n = str(t.name); return n ? [[n, str(t.reading)] as const] : []; })),
  };
}

/** Each problem of one block, as an LSP diagnostic with its place and its fixes. */
export function diagnostics(reading: NoteReading, graph: string, block: number, text: string, uri: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const own = reading.problems.filter((p: Problem) => p.graph === graph && p.block === block);
  for (const p of own) {
    const line = p.line - 1, range = rangeOf(text, line, p.replace?.written);
    const fixes: CodeAction[] = (p.replace?.with ?? []).map((w) => ({
      title: `Change ${p.replace?.written} to ${w}`, kind: 'quickfix', isPreferred: p.replace?.with.length === 1,
      edit: { changes: { [uri]: [{ range, newText: w }] } },
    }));
    out.push({
      range, severity: p.severity === 'warning' ? SEVERITY.Warning : SEVERITY.Error, source: 'graph-note',
      message: sentence(p.message, !!p.replace && p.message.startsWith(p.replace.written)), data: { fix: sentence(p.fix), fixes },
    });
  }
  // in a draft, a kind one or two letters from a kind written more often is warned of (§8)
  const d = reading.graphs.get(graph);
  if (d && !schemaOf(reading, graph)) {
    const count = new Map<string, number>();
    for (const b of d.boxes) for (const k of b.kind.split(' · ').filter(Boolean)) count.set(k, (count.get(k) ?? 0) + 1);
    const lines = text.split('\n');
    for (const [k, n] of count) {
      const near = [...count].filter(([u, m]) => u !== k && m > n && distance(k, u) <= 2).sort((a, b) => distance(k, a[0]) - distance(k, b[0]));
      const u = near[0]?.[0];
      if (!u || (near[1] && distance(k, near[1][0]) === distance(k, u))) continue;
      const dist = distance(k, u);
      lines.forEach((l, line) => {
        if (!new RegExp(`:\\s*${k}\\b`).test(l.replace(/\/\/.*$/, ''))) return;
        const range = rangeOf(text, line, k);
        out.push({
          range, severity: SEVERITY.Warning, code: 'near-duplicate', source: 'graph-note',
          message: `The kind ${k} is ${dist === 1 ? 'one letter' : 'two letters'} from ${u}, already in the graph.`,
          data: { fix: `Change ${k} to ${u}, or keep ${k} if it is a new kind.`, fixes: [{ title: `Change ${k} to ${u}`, kind: 'quickfix', isPreferred: true, edit: { changes: { [uri]: [{ range, newText: u }] } } }] },
        });
      });
    }
  }
  return out.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
}

/** What to suggest at a place in the block: names, kinds or relationships already in the graph — only the schema's when it is locked. */
export function completions(reading: NoteReading, graph: string, text: string, offset: number): { from: number; items: CompletionItem[] } {
  const before = text.slice(0, offset), none = { from: offset, items: [] };
  const last = tokenize(before).pop();
  if (last && (last.c === 'comment' || (last.c === 'string' && (last.s.length < 2 || last.s[last.s.length - 1] !== last.s[0])))) return none;
  const d = reading.graphs.get(graph), schema = schemaOf(reading, graph);
  if (!d) return none;
  const starts = (p: string) => (s: string) => s.toLowerCase().startsWith(p.toLowerCase());
  let m: RegExpExecArray | null;
  if ((m = /-\[\s*:\s*(\w*)$/.exec(before))) {
    const p = m[1] ?? '';
    const types = schema ? [...schema.types.keys()] : [...new Set(d.links.map((l) => l.type))];
    const reading_ = (t: string) => schema?.types.get(t) ?? d.links.find((l) => l.type === t)?.reading;
    return { from: offset - p.length, items: types.filter(starts(p)).sort().map((t) => ({ label: t, kind: KIND.Interface, detail: reading_(t) ?? t.replace(/_/g, ' ').toLowerCase() })) };
  }
  if ((m = /\(\s*\w+\s*:\s*(?:\w+\s*:\s*)*(\w*)$/.exec(before))) {
    const p = m[1] ?? '';
    const kinds = schema ? schema.kinds : [...new Set(d.boxes.flatMap((b) => b.kind.split(' · ').filter(Boolean)))];
    return { from: offset - p.length, items: kinds.filter(starts(p)).sort().map((k) => ({ label: k, kind: KIND.Class })) };
  }
  if ((m = /\(\s*(\w*)$/.exec(before))) {
    const p = m[1] ?? '';
    return { from: offset - p.length, items: d.boxes.filter((b) => starts(p)(b.key)).sort((a, b) => (a.key < b.key ? -1 : 1)).map((b) => ({ label: b.key, kind: KIND.Variable, detail: b.kind ? `${b.kind}: ${b.text}` : b.text })) };
  }
  return none;
}

const article = (k: string) => (/^[aeiou]/i.test(k) ? 'an' : 'a');

/** Each line of the block read back in plain English, by its 0-based line: what it writes, in the words of the graph. */
export function readBack(reading: NoteReading, graph: string, text: string): Map<number, string> {
  const d = reading.graphs.get(graph), out = new Map<number, string>();
  const textOf = (k: string) => d?.boxes.find((b) => b.key === k)?.text ?? `${k} (not in the graph)`;
  const words = (t: string) => d?.links.find((l) => l.type === t)?.reading ?? d?.estimates.find((e) => e.type === t)?.reading ?? t.replace(/_/g, ' ').toLowerCase();
  for (const it of blockItems(text)) {
    let said: string | null = null;
    const set = /^SET\s+(\w+)\.(\w+)\s*=\s*([\s\S]+)$/i.exec(it.text.trim());
    if (set) said = `${textOf(set[1] ?? '')}: ${set[2]} is ${(set[3] ?? '').trim().replace(/^'([\s\S]*)'$/, '$1')}`;
    else {
      const hs = hops(it.text);
      if (hs.length) said = hs.map(([s, t, e]) => `${textOf(s)} ${words(t)} ${textOf(e)}`).join('; ');
      else {
        const node = /^\(\s*(\w+)\s*:\s*([\w:]+)/.exec(it.text.trim());
        if (node) { const kind = (node[2] ?? '').split(':').filter((k) => !gs.SCHEMA_LABELS.includes(k))[0]; if (kind) said = `${textOf(node[1] ?? '')} is ${article(kind)} ${kind}`; }
      }
    }
    if (said) out.set(it.line, out.has(it.line) ? `${out.get(it.line)}; ${said}` : said);
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
