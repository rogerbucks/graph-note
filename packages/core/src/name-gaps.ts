// What a block's things are missing (editor spec §4): a thing given text but no name, and one given a name but no text.
// Each gets a warning that shows the suggestion and a fix that writes it; nothing is written unasked. A thing with text and
// no name cannot be read as written, so it is read as if the suggested name were there, in a copy.
import gs from '@graph-note/graph-spec';
import { blankText, items, lineAt } from './block-items.ts';
import { nameFromText, textFromName } from './name-suggestions.ts';
import type { Problem } from './note-reading.ts';

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

/** One thing as written in a block: where it is, its name, kinds and properties. */
interface Written {
  open: number;
  close: number;
  variable: { at: number; name: string } | null;
  labels: string[];
  /** Where the braces of its properties are, or null when it has none. */
  braces: { open: number; close: number } | null;
  /** Its string properties, by key; null for a property that is not a string. */
  props: Map<string, string | null>;
  /** Where its last kind, or its name, ends: where braces would be added. */
  end: number;
  /** Whether it writes a thing, or only names one already written (or found by MATCH). */
  writes: boolean;
  /** Whether it is in a MATCH, which finds things and never writes them. */
  matched: boolean;
  /** Whether its properties could not all be read: the reader says what is wrong, and nothing is suggested. */
  broken: boolean;
}

const NODE = /^(\s*)([A-Za-z_]\w*)?\s*((?::\s*[A-Za-z_]\w*\s*)*)(\{[^}]*\})?\s*$/;
const PROP = /\s*([A-Za-z_]\w*)\s*:\s*('(?:[^'\\]|\\.)*'|[^,}\s][^,}]*)\s*(,|$)/y;
const unquote = (s: string) =>
  s.slice(1, -1).replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));

/** A thing's text, as the drawing chooses it: the first of name, title, text and label that is a string. */
const textIn = (w: Written): string | undefined =>
  ['name', 'title', 'text', 'label'].map((k) => w.props.get(k)).find((v) => typeof v === 'string' && v) ?? undefined;

/** The things written in a block, in order, found in its items; the text inside strings and comments is never read. */
function writtenIn(text: string): Written[] {
  const blanked = blankText(text),
    out: Written[] = [];
  let matching = false;
  for (const it of items(text)) {
    const word = /^[A-Za-z]+/.exec(blanked.slice(it.from, it.to))?.[0].toUpperCase();
    if (word === 'MATCH') matching = true;
    else if (word === 'INSERT' || word === 'SET') matching = false;
    let depth = 0;
    for (let i = it.from; i < it.to; i++) {
      const c = blanked[i];
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth = Math.max(0, depth - 1);
      else if (c === '(' && depth === 0) {
        const close = blanked.indexOf(')', i);
        if (close === -1) break;
        const w = parse(text, blanked, i, close, matching);
        if (w) out.push(w);
        i = close;
      }
    }
  }
  return out;
}

/** One thing between its ( and its ), or null when it is not written the way a thing is. */
function parse(text: string, blanked: string, open: number, close: number, matched: boolean): Written | null {
  const inner = blanked.slice(open + 1, close),
    m = NODE.exec(inner);
  if (!m) return null;
  const labels = [...(m[3] ?? '').matchAll(/[A-Za-z_]\w*/g)].map((l) => l[0]);
  const braces = m[4] ? { open: open + 1 + inner.indexOf('{'), close: open + 1 + inner.lastIndexOf('}') } : null;
  const props = new Map<string, string | null>();
  let broken = false;
  if (braces) {
    const body = text.slice(braces.open + 1, braces.close);
    PROP.lastIndex = 0;
    while (body.slice(PROP.lastIndex).trim()) {
      const p = PROP.exec(body);
      if (!p || !p[1] || (!p[3] && body.slice(PROP.lastIndex).trim())) {
        broken = true;
        break;
      }
      const value = p[2] ?? '';
      props.set(p[1], value.startsWith("'") ? unquote(value) : null);
    }
  }
  const variable = m[2] ? { at: open + 1 + (m[1] ?? '').length, name: m[2] } : null;
  return {
    open,
    close,
    variable,
    labels,
    braces,
    props,
    end: open + 1 + inner.trimEnd().length,
    writes: !!(labels.length || (m[4] && m[4].replace(/[{}\s]/g, ''))),
    matched,
    broken,
  };
}

/** The 0-based line of a block, and the character on it, that an offset in the text is at. */
const placeOf = (text: string, at: number) => ({
  line: lineAt(text, at) - 1,
  character: at - (text.lastIndexOf('\n', at - 1) + 1),
});

const kindOf = (w: Written) => w.labels.find((l) => !gs.SCHEMA_LABELS.includes(l));
const quoted = (s: string) => `'${s.replace(/[\\']/g, '\\$&')}'`;

/** A thing with text and no name: the warning with the name suggested, and the place it goes. */
function unnamed(text: string, w: Written, name: string): { gap: Gap; naming: Naming } {
  const { line, character } = placeOf(text, w.open + 1),
    start = placeOf(text, w.open),
    end = text.indexOf('\n', w.open),
    closeAt = w.close + 1 <= (end === -1 ? text.length : end) ? w.close + 1 : end === -1 ? text.length : end;
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
    },
  };
}

/** A thing with a name and no text: the warning with the text suggested, and the property that adds it. */
function untexted(text: string, w: Written, name: string, suggested: string): Gap {
  const property = `name: ${quoted(suggested)}`;
  const braces = w.braces,
    inside = braces ? text.slice(braces.open + 1, braces.close) : '';
  const at = placeOf(text, braces ? braces.open + 1 : w.end);
  const written = !braces
    ? ` {${property}}`
    : !inside.trim()
      ? property
      : /^\s/.test(inside)
        ? `${property},`
        : `${property}, `;
  const start = placeOf(text, w.variable?.at ?? w.open);
  return {
    line: start.line + 1,
    severity: 'warning',
    message: `the thing ${name} has no text; suggested: ${quoted(suggested)}`,
    fix: `add {${property}} to it, or write other text`,
    insert: { ...at, text: written },
    fixTitle: `Add the text ${quoted(suggested)}`,
    span: { line: start.line, character: start.character, end: start.character + name.length },
  };
}

/**
 * What each block is missing. A thing written with text and no name gets a name suggested from the text, in the style of
 * the names of its graph (every block of it) and not one of them; a thing written with a name and no text gets a text
 * suggested from the name. Things in a MATCH, in a schema, and only named again are left alone; so is a thing with
 * neither a name nor text, which the reader says is wrong in its own words.
 */
export function nameGaps(blocks: GapBlock[]): BlockGaps[] {
  const written = blocks.map((b) => writtenIn(b.text));
  const names = new Map<string, Map<string, string>>();
  const namesOf = (graph: string | null) =>
    names.get(graph ?? '') ?? names.set(graph ?? '', new Map()).get(graph ?? '')!;
  blocks.forEach((b, i) => {
    for (const w of written[i] ?? []) {
      if (w.variable) namesOf(b.graph).set(w.variable.name, kindOf(w) ?? '');
      const id = w.props.get('id');
      if (id) namesOf(b.graph).set(id, '');
    }
  });
  return blocks.map((b, i) => {
    const out: BlockGaps = { problems: [], named: [] };
    for (const w of written[i] ?? []) {
      if (w.matched || w.broken || !w.writes || w.labels.some((l) => gs.SCHEMA_LABELS.includes(l))) continue;
      const text = textIn(w);
      if (!w.variable && text) {
        const taken = namesOf(b.graph),
          kind = kindOf(w);
        const { gap, naming } = unnamed(b.text, w, nameFromText(text, taken, kind));
        taken.set(naming.name, kind ?? '');
        out.problems.push(gap);
        out.named.push(naming);
      } else if (w.variable && !text && !w.props.has('name')) {
        const suggested = textFromName(w.variable.name);
        if (suggested) out.problems.push(untexted(b.text, w, w.variable.name, suggested));
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
