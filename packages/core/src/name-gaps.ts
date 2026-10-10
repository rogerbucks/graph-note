// What a block's things are missing (editor spec §4): a thing given text but no name, and one given a name but no text.
// A thing with text and no name cannot be read as written, so it is read as if the suggested name were there, in a copy,
// with a warning that shows the name and a fix that writes it. A thing with no text is drawn by its name, with a hint that
// offers the text. Nothing is written to the note unasked.
import gs from '@graph-note/graph-spec';
import { lineIndex } from './block-items.ts';
import { textFromName } from './name-suggestions.ts';
import { NameBook } from './name-book.ts';
import type { Problem } from './note-reading.ts';
import { TEXT_KEYS, setTexts, textKeyOf, writtenIn } from './written-things.ts';
import type { Written } from './written-things.ts';

/** A problem before its block and graph are known. */
type Gap = Omit<Problem, 'block' | 'graph'>;

/** A name suggested for a thing written without one, and the place after its ( where it would go. */
export interface Naming {
  line: number;
  character: number;
  name: string;
}

/** What one block is missing: a problem for each gap, and the names suggested for things written without one. */
export interface BlockGaps {
  problems: Gap[];
  named: Naming[];
}

/** A block's text, with the graph it draws; text is empty for a block that is not read. */
export interface GapBlock {
  text: string;
  graph: string | null;
}

/** A block's text, with the index of its lines: so finding a thing's line never slices the block from its start (§9). */
interface Indexed {
  text: string;
  lineOf: (pos: number) => number;
}

/** The 0-based line of a block, and the character on it, that an offset in the text is at. */
const placeOf = ({ text, lineOf }: Indexed, at: number) => ({
  line: lineOf(at) - 1,
  character: at - (text.lastIndexOf('\n', at - 1) + 1),
});

const kindOf = (w: Written) => w.labels.find((l) => !gs.SCHEMA_LABELS.includes(l));
const quoted = (s: string) => `'${s.replace(/[\\']/g, '\\$&')}'`;

/** A thing with text and no name: the warning with the name suggested, and the place it goes. */
function unnamed(block: Indexed, w: Written, name: string): { gap: Gap; naming: Naming } {
  const text = block.text;
  const { line, character } = placeOf(block, w.open + 1),
    start = placeOf(block, w.open),
    lineEnd = text.indexOf('\n', w.open),
    closeAt = Math.min(w.close + 1, lineEnd === -1 ? text.length : lineEnd);
  return {
    naming: { line, character, name },
    gap: {
      line: start.line + 1,
      severity: 'warning',
      message: `this thing has no name; suggested: ${name}`,
      fix: `add the name ${name} after the (, or write one of your own`,
      insert: { line, character, text: name },
      fixTitle: `Add the name ${name}`,
      span: { line: start.line, character: start.character, end: start.character + closeAt - w.open },
      suggested: name,
    },
  };
}

/** A thing with a name and no text: the hint with the text suggested, and the property that adds it. */
function untexted(block: Indexed, w: Written, name: string, key: string, suggested: string): Gap {
  const text = block.text;
  const property = `${key}: ${quoted(suggested)}`;
  const braces = w.braces,
    inside = braces ? text.slice(braces.open + 1, braces.close) : '';
  const at = placeOf(block, braces ? braces.open + 1 : w.end);
  const written = !braces
    ? ` {${property}}`
    : !inside.trim()
      ? property
      : /^\s/.test(inside)
        ? `${property},`
        : `${property}, `;
  const start = placeOf(block, w.variable?.at ?? w.open);
  return {
    line: start.line + 1,
    severity: 'hint',
    message: `the thing ${name} has no text; suggested: ${quoted(suggested)}`,
    fix: `add {${property}} to it, or write other text`,
    insert: { ...at, text: written },
    fixTitle: `Add the text ${quoted(suggested)}`,
    span: { line: start.line, character: start.character, end: start.character + name.length },
  };
}

/** What a graph's blocks show of its things: every name taken, which things have text, and the key each kind keeps it in. */
interface GraphFacts {
  /** Every name taken, with its kind: kept up to date as names are suggested, so naming many things never freezes (§9). */
  names: NameBook;
  texted: Set<string>;
  keys: Map<string, Map<string, number>>;
}

/** The key the things of a kind use most for their text, the first of name, title, text, label among equals; name if none. */
function keyFor(facts: GraphFacts, kind: string | undefined): string {
  const used = facts.keys.get(kind ?? '') ?? new Map<string, number>();
  return TEXT_KEYS.reduce((best, k) => ((used.get(k) ?? 0) > (used.get(best) ?? 0) ? k : best), TEXT_KEYS[0] ?? 'name');
}

/** A thing's text, when it has any: the string under its text key. */
const textOf = (w: Written): string | undefined => {
  const key = textKeyOf(w);
  return key ? (w.props.get(key) ?? undefined) : undefined;
};

/**
 * What each block is missing. A thing written with text and no name gets a name suggested from the text, in the style of
 * the names of its graph (every block of it), not one of them and not a word the language keeps; a thing written with a
 * name and no text gets a text suggested from the name, under the key its kind's other things use — unless a SET, or the
 * thing written again elsewhere in the graph, gives it text. Things in a MATCH, in a schema, and only named again are left
 * alone; so is a thing with neither a name nor text, or whose properties cannot be read, which the reader says in its
 * own words.
 */
export function nameGaps(blocks: GapBlock[]): BlockGaps[] {
  const written = blocks.map((b) => writtenIn(b.text));
  const graphs = new Map<string, GraphFacts>();
  const factsOf = (graph: string | null) => {
    const key = graph ?? '';
    return graphs.get(key) ?? graphs.set(key, { names: new NameBook(), texted: new Set(), keys: new Map() }).get(key)!;
  };
  blocks.forEach((b, i) => {
    const facts = factsOf(b.graph);
    for (const v of setTexts(b.text)) facts.texted.add(v);
    for (const w of written[i] ?? []) {
      const kind = kindOf(w) ?? '',
        key = textKeyOf(w);
      // a name only referred to is not taken: a link to the name a thing is drawn under links to that thing
      if (w.variable && w.writes) facts.names.set(w.variable.name, kind);
      const id = w.props.get('id');
      if (id) facts.names.set(id, '');
      if (w.matched || !key) continue;
      if (w.variable) facts.texted.add(w.variable.name);
      if (w.writes) {
        const used = facts.keys.get(kind) ?? facts.keys.set(kind, new Map()).get(kind)!;
        used.set(key, (used.get(key) ?? 0) + 1);
      }
    }
  });
  return blocks.map((b, i) => {
    const out: BlockGaps = { problems: [], named: [] },
      facts = factsOf(b.graph);
    let indexed: Indexed | null = null; // made only for a block with a gap
    const block = () => (indexed ??= { text: b.text, lineOf: lineIndex(b.text) });
    for (const w of written[i] ?? []) {
      if (w.matched || w.broken || !w.writes || w.labels.some((l) => gs.SCHEMA_LABELS.includes(l))) continue;
      const text = textOf(w);
      if (!w.variable && text) {
        const kind = kindOf(w),
          name = facts.names.name(text, kind);
        facts.names.set(name, kind ?? '');
        const { gap, naming } = unnamed(block(), w, name);
        out.problems.push(gap);
        out.named.push(naming);
      } else if (w.variable && !text && !facts.texted.has(w.variable.name)) {
        const key = keyFor(facts, kindOf(w)),
          suggested = textFromName(w.variable.name);
        if (suggested && !TEXT_KEYS.some((k) => w.props.has(k)))
          out.problems.push(untexted(block(), w, w.variable.name, key, suggested));
      }
    }
    return out;
  });
}

/** A copy of the block with the suggested names in, to be read as if written; a ( no longer there takes none. */
export function withNames(text: string, named: Naming[]): string {
  const lines = text.split('\n');
  for (const n of [...named].reverse()) {
    const line = lines[n.line] ?? '';
    if (line[n.character - 1] === '(') lines[n.line] = line.slice(0, n.character) + n.name + line.slice(n.character);
  }
  return lines.join('\n');
}
