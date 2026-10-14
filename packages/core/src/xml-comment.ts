// A `///` note written as an XML comment (editor spec §24, note_standard; graph spec req:26.plain), for an export to
// a format that is XML: GraphML here, SCXML in the Python library, which writes the same comment for the same note
// (python/graph_spec/tests/note_comment_cases.json holds both). XML forbids `--` inside a comment and a `-` at its end,
// and only `-->` ends one, so the note's text is escaped until it can never end its comment, and is read back exactly:
// a backslash is written `\\`, a hyphen directly after a hyphen `\-`, a carriage return `\r` (XML would make it a
// line feed) and a character XML 1.0 cannot hold `\u{…}`, its code point in hexadecimal. Nothing else is changed, so
// a note reads as written in the file. The text is spaced from `<!--` and `-->`, so it never ends with a hyphen.

/**
 * Whether XML 1.0 cannot hold a character, even as a reference: a control character other than tab, line feed and
 * carriage return, the two non-characters U+FFFE and U+FFFF, or half of a surrogate pair alone (a whole pair is one
 * character, beyond U+FFFF, as a string is walked by its characters).
 */
export const notXml = (c: string): boolean => {
  const code = c.codePointAt(0) ?? 0;
  return (
    (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
    code === 0xfffe ||
    code === 0xffff ||
    (code >= 0xd800 && code <= 0xdfff)
  );
};

/**
 * A note's text as the comment writes it, one piece for each character, given out as it is taken: linear by
 * construction, as all it keeps between characters is the last character written (never the text written so far,
 * which a search of would make a run of hyphens quadratic).
 */
export function* commentPieces(note: Iterable<string>): Generator<string> {
  let last = '';
  for (const c of note) {
    let piece = c;
    if (c === '\\') piece = '\\\\';
    else if (c === '\r') piece = '\\r';
    else if (c === '-' && last === '-') piece = '\\-';
    else if (notXml(c)) piece = `\\u{${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`;
    last = piece.slice(-1);
    yield piece;
  }
}

/** A note as the XML comment that holds it, `<!-- … -->`, its pieces joined once. */
export function noteComment(note: string): string {
  return `<!-- ${[...commentPieces(note)].join('')} -->`;
}
