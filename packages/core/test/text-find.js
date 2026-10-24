// Pieces of a drawing's text found by plain search, not by a pattern (risk SEC-18). The tests read the code's own
// drawings. The code scan counts a pattern there as one that can run slow. On text made for it, its time grew with the
// square of the text's length. These cuts look at each character a fixed number of times, so they stay quick.

/** The text between the first `open` and the next `close` after it. Undefined when either is missing. */
export function between(text, open, close) {
  const start = text.indexOf(open);
  if (start < 0) return undefined;
  const end = text.indexOf(close, start + open.length);
  return end < 0 ? undefined : text.slice(start + open.length, end);
}

/** Each piece from an `open` to the next `close` after it, both kept, in the order they come. */
export function pieces(text, open, close) {
  const found = [];
  for (let start = text.indexOf(open); start >= 0;) {
    const end = text.indexOf(close, start + open.length);
    if (end < 0) break;
    found.push(text.slice(start, end + close.length));
    start = text.indexOf(open, end + close.length);
  }
  return found;
}

/** Whether each of `parts` comes in `text`, each after the one before it. */
export function inOrder(text, ...parts) {
  let at = 0;
  for (const part of parts) {
    const found = text.indexOf(part, at);
    if (found < 0) return false;
    at = found + part.length;
  }
  return true;
}

/**
 * The innermost rules of a style sheet, each as its selector and its body. A rule is the text before a `{` back to the
 * last brace, then the text up to the next `}`. That is what `/([^{}]+)\{([^{}]*)\}/g` matched, read by the braces.
 */
export function cssRules(sheet) {
  const rules = [];
  for (const chunk of sheet.split('}').slice(0, -1)) {
    const open = chunk.lastIndexOf('{');
    if (open < 0) continue;
    const selector = chunk.slice(0, open).split('{').pop() ?? '';
    if (selector) rules.push({ selector, body: chunk.slice(open + 1) });
  }
  return rules;
}

/** The style sheet without each block that starts with `at` (as `@keyframes`), its nested braces and all. */
export function withoutBlocks(sheet, at) {
  let out = sheet;
  for (let start = out.indexOf(at); start >= 0; start = out.indexOf(at, start)) {
    let i = out.indexOf('{', start);
    if (i < 0) break;
    for (let depth = 0; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}' && --depth === 0) break;
    }
    out = out.slice(0, start) + out.slice(i + 1);
  }
  return out;
}

/** The style sheet without each opening of a block that starts with `at` (as `@media`), its rules kept. */
export function withoutOpenings(sheet, at) {
  let out = sheet;
  for (let start = out.indexOf(at); start >= 0; start = out.indexOf(at, start)) {
    const open = out.indexOf('{', start);
    if (open < 0) break;
    out = out.slice(0, start) + out.slice(open + 1);
  }
  return out;
}
