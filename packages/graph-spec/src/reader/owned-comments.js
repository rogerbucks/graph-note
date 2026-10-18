// The comments an element owns (graph spec §26 notes, §27 tagged comments), as owned_comments.py reads them. A run of
// /// note lines and //@ key: value lines is owned by the element on the line directly below it.
'use strict';

const { header, tokens } = require('./tokens.js');
const { Parser } = require('./parser.js');
const { trim, trimStart, trimEnd } = require('./whitespace.js');

// §26: exactly three slashes, then a space or the line's end; §27: //@, a space, a key, its colon and the value
const NOTE = /^\/\/\/(?: |$)/,
  TAG = /^\/\/@ ([A-Za-z_][A-Za-z0-9_.-]*):([^\n]*)$/; // [^\n], as Python's .: JavaScript's . also stops at CR, U+2028 and U+2029

/** The one element each line of code begins.
 * - one: [[line, element]] for every line that begins exactly one, by the names written. A thing is {thing: its name}
 *   and a link is {link: [from, type, to]}.
 * - shared: the lines that begin more than one, none of them inside an element written above. */
function elementsByLine(block) {
  const counts = new Map(),
    first = new Map();
  const add = (line, element) => {
    counts.set(line, (counts.get(line) ?? 0) + 1);
    if (!first.has(line)) first.set(line, element);
  };
  const t = tokens(block);
  if (!t.length) return { one: new Map(), shared: new Set() };
  // a line that begins inside an element written above it — within its brackets — holds more than one element
  const inside = new Set();
  let depth = 0,
    last = 0;
  for (const [kind, text, line] of t) {
    if (line !== last && depth > 0) inside.add(line);
    last = line;
    if (kind === 'p' && '([{'.includes(text)) depth++;
    else if (kind === 'p' && ')]}'.includes(text)) depth--;
  }
  const [, paths] = new Parser(t).statement();
  for (const [nodes, rels] of paths) {
    for (const n of nodes) if (n.labels.length || Object.keys(n.props).length) add(n.line, { thing: n.v });
    rels.forEach((r, i) => add(r.line, { link: [nodes[i].v, r.type, nodes[i + 1].v] }));
  }
  return {
    one: new Map([...first].filter(([line]) => counts.get(line) === 1 && !inside.has(line))),
    shared: new Set([...counts].filter(([line, n]) => n > 1 && !inside.has(line)).map(([line]) => line)),
  };
}

/** What ownedComments gives, each owned entry also with its /// lines' numbers (lines). Also shared: each line holding
 * more than one element with a note's /// lines directly above it, as {line, lines}. The notes (notes.js) read it. */
function scanComments(block) {
  const out = { owned: [], unowned: [], malformed: [], shared: [] };
  const [, kind] = header(block);
  if (kind === 'query' || kind === 'excerpt') return out;
  const { one: elements, shared } = elementsByLine(block);
  let run = [];
  const unowned = () => {
    out.unowned.push(...run.map((c) => c.line));
    run = [];
  };
  block.split('\n').forEach((raw, i) => {
    const line = i + 1,
      text = trimStart(raw);
    // whitespace at a note line's end, a CR before its LF among it, is never its text (§3: GQL's whitespace)
    if (NOTE.test(trimEnd(text))) run.push({ line, note: trimEnd(text).slice(4) });
    else if (text.startsWith('//@')) {
      const m = TAG.exec(text);
      if (m) run.push({ line, tag: [m[1], trim(m[2])] });
      else {
        out.malformed.push(line);
        unowned();
      }
    } else if (!trim(text) || text.startsWith('//')) unowned();
    else if (run.length && elements.has(line)) {
      const note = run.filter((c) => 'note' in c).map((c) => c.note);
      const from = note.findIndex((s) => s !== ''),
        to = from < 0 ? -1 : note.indexOf('', from);
      out.owned.push({
        line,
        element: elements.get(line),
        tags: run.filter((c) => 'tag' in c).map((c) => c.tag),
        note,
        summary: from < 0 ? '' : note.slice(from, to < 0 ? undefined : to).join('\n'),
        lines: run.filter((c) => 'note' in c).map((c) => c.line),
      });
      run = [];
    } else {
      const noted = run.filter((c) => 'note' in c).map((c) => c.line);
      if (noted.length && shared.has(line)) out.shared.push({ line, lines: noted });
      unowned();
    }
  });
  unowned();
  return out;
}

/** The notes and //@ lines a block's elements own (§26, §27).
 * - owned: in line order. Each has its element's line, the element, and its tags as [key, value] in order. Each has its
 *   note's lines (a bare /// is an empty line, a paragraph break) and its summary, the note's first paragraph.
 * - unowned: the lines of each run with no one element directly below it.
 * - malformed: each //@ line with no key, read as an ordinary comment.
 * A //@ line is never a note. Refuses what the reader refuses, with its ProfileError. A query or an excerpt owns
 * nothing. */
function ownedComments(block) {
  const { owned, unowned, malformed } = scanComments(block);
  return { owned: owned.map(({ lines: _lines, ...o }) => o), unowned, malformed };
}

module.exports = { ownedComments, scanComments };
