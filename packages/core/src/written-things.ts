// The things written in a block, found by their parentheses (editor spec §4): each with its name, kinds and properties and
// where they are, so what a thing is missing can be told and fixed in place. Text inside strings and comments is never read.
import { blankText, items } from './block-items.ts';

/** One thing as written in a block: where it is, its name, kinds and properties. */
export interface Written {
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

/** The properties that give a thing its text, in the order the drawing chooses among them. */
export const TEXT_KEYS = ['name', 'title', 'text', 'label'];

/** The key a thing's text is written under — the first of name, title, text and label that holds a string — if it has text. */
export const textKeyOf = (w: Written): string | undefined =>
  TEXT_KEYS.find((k) => {
    const v = w.props.get(k);
    return typeof v === 'string' && v;
  });

/** The things written in a block, in order, found in its items; the text inside strings and comments is never read. */
export function writtenIn(text: string): Written[] {
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

/** The variables of the things a SET gives text to — SET a.name = 'Alpha' — in a block, by the name the SET calls them. */
export function setTexts(text: string): Set<string> {
  const blanked = blankText(text),
    out = new Set<string>();
  let setting = false;
  for (const it of items(text)) {
    const here = blanked.slice(it.from, it.to),
      word = /^[A-Za-z]+/.exec(here)?.[0].toUpperCase();
    if (word === 'SET') setting = true;
    else if (word === 'MATCH' || word === 'INSERT') setting = false;
    if (!setting) continue;
    for (const m of here.matchAll(/([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*=/g)) {
      let at = it.from + (m.index ?? 0) + m[0].length;
      while (/\s/.test(text[at] ?? '')) at++;
      if (TEXT_KEYS.includes(m[2] ?? '') && text[at] === "'" && text[at + 1] !== "'") out.add(m[1] ?? '');
    }
  }
  return out;
}
