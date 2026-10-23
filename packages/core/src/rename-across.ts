// A thing renamed across notes (editor spec §27, rename_follows_notes; risk NEURO-10). One graph can be written in
// blocks of many notes. When a person renames a thing, each block of that graph that names it is rewritten, in each
// note. It is one bundle the person reviews and applies (MeshHistory.bundle). Nothing is written here.
//
// A note whose block of the graph cannot be read is listed, never rewritten blind. So is every note when the new name
// is taken in the graph already, as two things would then share one name. Only the names are changed. Each is a name
// that opens a thing, a name before a dot (as SET writes it) or an id written as text. Nothing else in the text moves.
import gs from '@thoughtknot/graph-spec';
import { gqlSpans } from './fences.ts';

/** Why a note that names the thing is listed and not rewritten. */
export type NotRewritten = 'unreadable' | 'taken';

/** The rename across notes: each note's new text, and the notes listed to fix by hand, with why. */
export interface RenameAcross {
  changes: Record<string, string>;
  listed: { note: string; why: NotRewritten }[];
}

type Token = [string, string, number, string, number];

const PLAIN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Where `key` is written as a thing's name in a block's tokens: each as [start, end, the text to write there]. */
function placesOf(tokens: Token[], key: string, to: string): [number, number, string][] {
  const out: [number, number, string][] = [];
  tokens.forEach(([kind, text, , raw, end], i) => {
    const before = tokens[i - 1]?.[1],
      after = tokens[i + 1]?.[1];
    if (kind === 'id' && text === key && (before === '(' || (after === '.' && before !== '.')))
      out.push([end - raw.length, end, to]);
    // an id written as text: {id: 'key'}
    if (kind === 'str' && raw === `'${key}'` && before === ':' && tokens[i - 2]?.[1] === 'id')
      out.push([end - raw.length, end, `'${to}'`]);
  });
  return out;
}

/** The blocks of a note that belong to `graph`, each with its span and its tokens, or null where one is unreadable. */
function blocksOf(
  note: string,
  graph: string,
): { open: number; close: number; text: string; tokens: Token[] }[] | null {
  const out = [];
  for (const span of gqlSpans(note)) {
    let name: string | null, tokens: Token[];
    try {
      name = gs.header(span.text)[0];
      if (name !== graph) continue;
      tokens = gs.tokens(span.text);
    } catch {
      if (span.text.includes(graph)) return null;
      continue;
    }
    out.push({ ...span, tokens });
  }
  return out;
}

/** A note with its blocks' new texts put in place of the old, line for line. */
function withBlocks(note: string, blocks: { open: number; close: number; text: string }[]): string {
  const lines = note.split('\n');
  for (const b of [...blocks].sort((x, y) => y.open - x.open)) {
    const cr = (lines[b.open + 1] ?? '').endsWith('\r') ? '\r' : '';
    lines.splice(b.open + 1, b.close - b.open - 1, ...b.text.split('\n').map((l) => l + cr));
  }
  return lines.join('\n');
}

/**
 * The thing `from` of `graph` renamed `to` in every note that names it. Each note's new text is given, and the notes
 * that could not be rewritten are listed with why. A name that is not a plain name changes nothing.
 */
export function renameAcross(notes: Record<string, string>, graph: string, from: string, to: string): RenameAcross {
  const result: RenameAcross = { changes: {}, listed: [] };
  if (!PLAIN.test(to) || from === to) return result;
  const read = Object.keys(notes)
    .sort()
    .map((note) => ({ note, blocks: blocksOf(notes[note] ?? '', graph) }));
  const naming = read.filter((r) => r.blocks === null || r.blocks.some((b) => placesOf(b.tokens, from, to).length > 0));
  const taken = read.some((r) => r.blocks?.some((b) => placesOf(b.tokens, to, to).length > 0));
  for (const { note, blocks } of naming) {
    if (blocks === null || taken) {
      result.listed.push({ note, why: blocks === null ? 'unreadable' : 'taken' });
      continue;
    }
    const rewritten = blocks.map((b) => {
      let text = b.text;
      for (const [start, end, put] of placesOf(b.tokens, from, to).reverse())
        text = text.slice(0, start) + put + text.slice(end);
      return { ...b, text };
    });
    result.changes[note] = withBlocks(notes[note] ?? '', rewritten);
  }
  return result;
}
