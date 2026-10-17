// The messages a view gives its reader (editor spec §41, ux_copy_auto): its words, gathered as a reader meets them, and
// the names, hints and titles a screen reader or a pointer gives. What comes from the person's own note is left out (the
// drawing, the graph's text version, the text being edited, code), as the words there are theirs, not ours. Runs on
// jsdom and on the Obsidian host's fake DOM. Test support only.

/** Parts whose words are the person's own: drawings, text versions of them, the text being edited and code. */
const THEIRS = [
  'svg',
  'textarea',
  'pre',
  'code',
  'input',
  '.graph-note-sr',
  '.graph-note-overlay',
  '.graph-note-tip-body',
  '.gn-prose',
  '[contenteditable="true"]',
];
/** Tags read as part of the words around them: their words join the message they sit in. */
const INLINE = new Set([
  'span',
  'b',
  'strong',
  'em',
  'i',
  'a',
  'kbd',
  'abbr',
  'small',
  'mark',
  'q',
  'sup',
  'sub',
  'br',
]);
/** Attributes that are messages in their own right. */
const SAID = [
  'aria-label',
  'aria-description',
  'title',
  'placeholder',
  'alt',
  'aria-valuetext',
  'aria-roledescription',
];

const theirs = (e) => THEIRS.some((sel) => e.matches?.(sel));
const hidden = (e) => e.hasAttribute?.('hidden') || e.getAttribute?.('aria-hidden') === 'true';
const isText = (n) => n.nodeType === 3 || n.tagName === '#TEXT';
const textOf = (n) => (n.nodeType === 3 ? n.nodeValue : n.text) ?? '';
/** An element's children, text and elements alike, in order: jsdom's child nodes, or the fake DOM's children. */
const childrenOf = (e) => [...(e.childNodes ?? e.children)];
/** The text an element holds itself, before its children (the fake DOM keeps it apart from them). */
const ownText = (e) => (e.childNodes ? '' : (e.text ?? ''));
/** The words of an element as one message: its own and its children's, in order, the person's own put by. */
const flat = (e) =>
  ownText(e) +
  childrenOf(e)
    .map((c) => (isText(c) ? textOf(c) : theirs(c) || hidden(c) ? ' … ' : flat(c)))
    .join('');

/**
 * Every message under `root`, once each, in document order: [{ text, where }], `where` naming the element it is on. An
 * element whose children are all inline words is one message; any other has its own words, then its children's.
 */
export function messagesOf(root) {
  const out = [];
  const add = (text, where) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (/[\p{L}]/u.test(t)) out.push({ text: t, where });
  };
  const walk = (e) => {
    if (theirs(e) || hidden(e)) return;
    for (const a of SAID) if (e.getAttribute(a)) add(e.getAttribute(a), `${e.localName}[${a}]`);
    const kids = childrenOf(e).filter((c) => !isText(c));
    if (kids.every((c) => INLINE.has(c.localName) && !theirs(c))) {
      add(flat(e), e.localName);
      for (const c of kids) for (const a of SAID) if (c.getAttribute(a)) add(c.getAttribute(a), `${c.localName}[${a}]`);
      return;
    }
    add(ownText(e) + childrenOf(e).filter(isText).map(textOf).join(' '), e.localName);
    kids.forEach(walk);
  };
  walk(root);
  const seen = new Set();
  return out.filter((m) => !seen.has(m.text) && seen.add(m.text));
}
