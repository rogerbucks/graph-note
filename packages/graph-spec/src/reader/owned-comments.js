// The comments an element owns (graph spec §26 notes, §27 tagged comments), as owned_comments.py reads them: a run of
// /// note lines and //@ key: value lines is owned by the element on the line directly below it.
'use strict';

const { header, tokens } = require('./tokens.js');
const { Parser } = require('./parser.js');
const { trim, trimStart } = require('./whitespace.js');

// §26: exactly three slashes, then a space or the line's end; §27: //@, a space, a key, its colon and the value
const NOTE = /^\/\/\/(?: |$)/,
  TAG = /^\/\/@ ([A-Za-z_][A-Za-z0-9_.-]*):([^\n]*)$/; // [^\n], as Python's .: JavaScript's . also stops at CR, U+2028 and U+2029

/** The one element each line of code begins: [[line, element]] for every line that begins exactly one, a thing as
 * {thing: its name} and a link as {link: [from, type, to]}, by the names written. */
function elementsByLine(block) {
  const counts = new Map(),
    first = new Map();
  const add = (line, element) => {
    counts.set(line, (counts.get(line) ?? 0) + 1);
    if (!first.has(line)) first.set(line, element);
  };
  const t = tokens(block);
  if (!t.length) return new Map();
  const [, paths] = new Parser(t).statement();
  for (const [nodes, rels] of paths) {
    for (const n of nodes) if (n.labels.length || Object.keys(n.props).length) add(n.line, { thing: n.v });
    rels.forEach((r, i) => add(r.line, { link: [nodes[i].v, r.type, nodes[i + 1].v] }));
  }
  return new Map([...first].filter(([line]) => counts.get(line) === 1));
}

/** The notes and //@ lines a block's elements own (§26, §27): owned, in line order, each with its element's line, the
 * element, its tags as [key, value] in order, its note's lines (a bare /// is an empty line, a paragraph break) and its
 * summary, the note's first paragraph; unowned, the lines of each run with no one element directly below it; and
 * malformed, each //@ line with no key, read as an ordinary comment. A //@ line is never a note. Refuses what the
 * reader refuses, with its ProfileError; a query or an excerpt owns nothing. */
function ownedComments(block) {
  const out = { owned: [], unowned: [], malformed: [] };
  const [, kind] = header(block);
  if (kind === 'query' || kind === 'excerpt') return out;
  const elements = elementsByLine(block);
  let run = [];
  const unowned = () => {
    out.unowned.push(...run.map((c) => c.line));
    run = [];
  };
  block.split('\n').forEach((raw, i) => {
    const line = i + 1,
      text = trimStart(raw);
    if (NOTE.test(text)) run.push({ line, note: text.slice(4) });
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
      });
      run = [];
    } else unowned();
  });
  unowned();
  return out;
}

module.exports = { ownedComments };
