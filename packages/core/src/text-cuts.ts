// Small cuts of text made without a pattern that can run slow, or that one pass leaves half done (#849). The code scan
// found patterns like these that took time growing with the square of the text's length. It also found tags taken out
// in one pass, which can leave a new tag made of the pieces round each one removed.

/**
 * The text with every match of `pattern` removed, again and again until none is left. `pattern` has the g flag. With
 * `left`, a quick test that finds the start of every match, a pass is made only while it finds one.
 */
export function removeAll(text: string, pattern: RegExp, left?: RegExp): string {
  let before: string;
  let out = text;
  do {
    before = out;
    out = out.replace(pattern, '');
  } while (out !== before && (!left || left.test(out)));
  return out;
}

/** The text up to the first of `marks`, or all of it when none is there. */
export function cutAtFirst(text: string, ...marks: string[]): string {
  let end = text.length;
  for (const mark of marks) {
    const at = text.indexOf(mark);
    if (at >= 0 && at < end) end = at;
  }
  return text.slice(0, end);
}

/** The text without any of `chars` at its start or its end. */
export function trimChars(text: string, chars: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start] ?? '')) start++;
  while (end > start && chars.includes(text[end - 1] ?? '')) end--;
  return text.slice(start, end);
}

/** Where the quoted string that starts at `at` ends, just after its closing quote. -1 when it is not closed. */
export function quoteEnd(text: string, at: number): number {
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === "'") return i + 1;
  }
  return -1;
}
