// A block's top-level items (spec §3): each path, SET or MATCH by where it is in the text, so what cannot be read can be
// left out of the drawing while the rest is drawn; the text with strings and comments blanked, so words in them never
// match; and where each link type written without its colon is.

/** A top-level item of a block — one path, or one SET or MATCH clause — by its character span. */
export interface Item {
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
export const blankText = (text: string): string =>
  text
    .replace(/'(?:[^'\\\n]|\\.)*'?/g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

/**
 * Where each link type written without its colon is in a block, in the order the reader reads them: its line, and the
 * characters its name spans. Strings and comments are blanked first, so words in them are never taken for one.
 */
export function bareNames(text: string): { line: number; character: number; end: number }[] {
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
export function items(text: string): Item[] {
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

/** The 1-based line a character of the text is on. */
export const lineAt = (text: string, pos: number): number => text.slice(0, pos).split('\n').length;

/** The block with an item blanked out (newlines kept, so every other line keeps its number), with the comma beside it. */
export function without(text: string, all: Item[], drop: Item[]): string {
  // UTF-16 units, as the places were counted: an emoji is two of them, and blanking by characters would slip (§3)
  const chars = text.split('');
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
