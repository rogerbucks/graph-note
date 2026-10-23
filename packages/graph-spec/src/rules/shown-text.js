// The text a thing is shown by in a drawing: chosen by one ranked rule, the same from Python (views.py, shown_text).
'use strict';

// The usual name keys a thing's text is written under, tried first.
const NAME_KEYS = ['name', 'title', 'text', 'label'];
// The common keys for wording, tried after the name keys.
const WORDING_KEYS = ['statement', 'summary', 'heading', 'question', 'description'];
// The most characters a box shows; longer text is cut at a word and ends in "…".
const SHOWN_LIMIT = 80;

const filled = (v) => typeof v === 'string' && v !== '';
// Readable: a letter, two words with a space between, and not a link: never an id, a date or a number
const readable = (v) => filled(v) && /[^ ] +[^ ]/.test(v) && /\p{L}/u.test(v) && !v.includes('://');

/** Text cut to the limit, counted in characters: at the last space in its second half, else mid-word, then "…". */
function clipShown(text) {
  // no longer than the limit in code units is no longer in characters: most text, never split up
  if (text.length <= SHOWN_LIMIT) return text;
  const chars = [...text];
  if (chars.length <= SHOWN_LIMIT) return text;
  let head = chars.slice(0, SHOWN_LIMIT - 1).join('');
  const space = head.lastIndexOf(' ');
  if (space >= 0 && [...head.slice(0, space)].length >= SHOWN_LIMIT / 2) head = head.slice(0, space);
  return head.replace(/ +$/, '') + '…';
}

/** The name and wording keys, in the order they are tried. */
const TEXT_KEYS = [...NAME_KEYS, ...WORDING_KEYS];

/** Each node type's shown_by, by the type's name: from the graph's own schema, else the shared one. */
function shownByType(g, shared) {
  let elementTypes = g.labelled('ElementType').map((i) => g.p(i));
  if (!elementTypes.length && shared) elementTypes = shared.labelled('ElementType').map((i) => shared.p(i));
  return new Map(elementTypes.filter((t) => t.kind === 'node' && filled(t.shown_by)).map((t) => [t.name, t.shown_by]));
}

/** The property a thing's schema says it is shown by: the first of its kinds, in code order, whose node type names one. */
function shownBy(g, id, named) {
  if (!named.size) return undefined;
  const kinds = [...(g.nodes.get(id)?.[0] ?? [])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return kinds.map((k) => named.get(k)).find(Boolean);
}

/**
 * The text each thing of a graph is shown by, as shownText gives it. The schema is read once for them all, so a
 * drawing of many things never reads it again for each one.
 */
function shownTexts(g, shared) {
  const named = shownByType(g, shared);
  return (id) => {
    const p = g.p(id);
    const by = shownBy(g, id, named);
    const key =
      (by !== undefined && filled(p[by]) ? by : undefined) ??
      TEXT_KEYS.find((k) => filled(p[k])) ??
      Object.keys(p).find((k) => k !== 'id' && readable(p[k]));
    return key === undefined ? [id, null] : [clipShown(p[key]), key];
  };
}

/**
 * [text, key] a thing is shown by. The first that gives text wins: its schema's shown_by, a name key, a wording key,
 * then its first readable text. Else it is its id, with key null. The text is cut by clipShown.
 */
const shownText = (g, id, shared) => shownTexts(g, shared)(id);

module.exports = { NAME_KEYS, WORDING_KEYS, SHOWN_LIMIT, clipShown, shownText, shownTexts };
