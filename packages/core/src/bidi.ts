// A person's own words in a drawing keep their own direction (editor spec §42, bidi_labels). A label with a
// right-to-left letter, such as Arabic or Hebrew, is set apart from what is around it. It is read from its first strong
// letter: Unicode's first strong isolate (U+2068) to the pop directional isolate (U+2069). So "שלום 2024 ABC" is never
// reordered, in the drawing, a picture saved from it or any viewer. A label with none stays byte for byte as it was.
// graph_bidi.isolated in the Python library does the same, by the same blocks.

/** A letter of a right-to-left block: Hebrew to Arabic Extended-A, their presentation forms, and the astral ones. */
const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff\u{10800}-\u{10fff}\u{1e800}-\u{1efff}]/u;

/** Whether `text` holds a right-to-left letter. */
export const hasRtl = (text: string): boolean => RTL.test(text);

/**
 * `text`, already escaped for SVG, set apart and read from its first strong letter when it holds a right-to-left one.
 * Words already set apart are left as they are.
 */
export const isolated = (text: string): string =>
  RTL.test(text) && !text.startsWith('&#x2068;') ? `&#x2068;${text}&#x2069;` : text;

/** Every text and text span of `svg` with a right-to-left letter, isolated (`isolated`). */
export const isolateLabels = (svg: string): string =>
  svg.replace(
    /(<(?:text|tspan)\b[^>]*>)([^<]+)(?=<\/(?:text|tspan)>)/g,
    (_w, open: string, words: string) => open + isolated(words),
  );
