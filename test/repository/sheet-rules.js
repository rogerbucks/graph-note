// The rules of a style sheet, read for the tests that hold the sheets to a rule of their own (forced colours, text scaling).
// Test code only — nothing here ships.
import { read } from './repo.js';

/** The style sheets of every host: the plugin's, which the browser page takes in too, and the page's own. */
export const SHEETS = ['styles.css', 'packages/claude-code/page/page.css'];

/** `text` cut at each `sep` that is not inside brackets or parentheses. */
function splitTop(text, sep) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === sep && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * Each rule of `sheet`, its comments dropped and in order. A rule has its selectors, its declarations as [property,
 * value] pairs, and the condition of the @media it sits in, or '' at the top.
 */
export function rulesOf(sheet) {
  const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const walk = (body, media) => {
    let at = 0;
    for (;;) {
      const open = body.indexOf('{', at);
      if (open < 0) return;
      let depth = 1;
      let end = open + 1;
      for (; depth && end < body.length; end += 1)
        if (body[end] === '{') depth += 1;
        else if (body[end] === '}') depth -= 1;
      const head = body.slice(at, open).trim();
      const inner = body.slice(open + 1, end - 1);
      if (head.startsWith('@media')) walk(inner, head.slice('@media'.length).trim());
      else if (!head.startsWith('@'))
        rules.push({
          selectors: splitTop(head, ','),
          media,
          declarations: splitTop(inner, ';').map((d) => [
            d.slice(0, d.indexOf(':')).trim(),
            d.slice(d.indexOf(':') + 1).trim(),
          ]),
        });
      at = end;
    }
  };
  walk(css, '');
  return rules;
}

/** The value `rule` gives `property`, the last if it gives it twice, or undefined. */
export const valueOf = (rule, property) => rule.declarations.findLast(([p]) => p === property)?.[1];
