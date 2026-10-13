// The part of the CSS cascade a test needs: for one element, in given states, which declaration wins each property, by
// importance, then specificity, then order. Not a browser: every @media block is taken to apply, a child combinator is read
// as a descendant one, :is() is written out as one selector for each argument, and a selector with a pseudo-element or any
// other functional pseudo-class never matches.

/** The shorthands that set each longhand a test asks about. */
const SHORTHANDS = {
  'background-color': ['background'],
  'border-color': ['border'],
  'border-width': ['border'],
  'border-style': ['border'],
  'font-size': ['font'],
  'font-family': ['font'],
  'line-height': ['font'],
};

/** A selector list split at its top-level commas, so the commas inside :is( ) stay where they are. */
function splitList(list) {
  const out = [];
  let depth = 0,
    from = 0;
  [...list].forEach((c, i) => {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(list.slice(from, i));
      from = i + 1;
    }
  });
  out.push(list.slice(from));
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * A selector with each :is(a, b) written out as one selector for each of its arguments, as the specificity of :is() is
 * that of its most specific argument: a rule over :is(path, polygon) is two rules, of the one specificity.
 */
function expandIs(selector) {
  const m = /:is\(([^()]*)\)/.exec(selector);
  if (!m) return [selector];
  return splitList(m[1]).flatMap((arg) =>
    expandIs(selector.slice(0, m.index) + arg + selector.slice(m.index + m[0].length)),
  );
}

/** Every style rule in a stylesheet, flattened out of its @media blocks: { selectors, declarations, source, order }. */
export function rules(css, source) {
  const out = [];
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, prelude, block] of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = prelude.trim();
    if (head.startsWith('@')) continue;
    const declarations = [];
    for (const d of block.split(';')) {
      const at = d.indexOf(':');
      if (at < 0) continue;
      const value = d.slice(at + 1).trim();
      declarations.push({
        property: d.slice(0, at).trim().toLowerCase(),
        value: value.replace(/\s*!important$/, ''),
        important: /!important$/.test(value),
      });
    }
    out.push({ selectors: splitList(head).flatMap(expandIs), declarations, source });
  }
  return out;
}

/** A selector's specificity as [ids, classes, types]. */
export function specificity(selector) {
  const s = selector.replace(/::[\w-]+/g, ' x ');
  return [
    (s.match(/#[\w-]+/g) ?? []).length,
    (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) ?? []).length,
    (s.replace(/\[[^\]]*\]/g, '').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length,
  ];
}

const compound = /^(\*|[a-z][\w-]*)?((?:\.[\w-]+|\[[^\]]+\]|:[\w-]+)*)$/i;

/** Whether one compound selector, such as textarea.graph-note-text:hover, matches one element. */
function matchesOne(part, el) {
  const m = compound.exec(part);
  if (!m) return false;
  const [, tag, rest] = m;
  if (tag && tag !== '*' && tag.toLowerCase() !== el.tag) return false;
  for (const [piece] of rest.matchAll(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g)) {
    if (piece.startsWith('.') && !el.classes.includes(piece.slice(1))) return false;
    if (piece.startsWith(':') && !(el.states ?? []).includes(piece.slice(1))) return false;
    if (piece.startsWith('[')) {
      const [name, value] = piece.slice(1, -1).split('=');
      const has = (el.attrs ?? {})[name.trim()];
      if (has === undefined || (value !== undefined && has !== value.trim().replace(/^['"]|['"]$/g, ''))) return false;
    }
  }
  return true;
}

/** Whether a selector matches an element: { tag, classes, states?, attrs?, ancestors: [nearest first] }. */
export function matches(selector, el) {
  if (/::|\(/.test(selector)) return false;
  const parts = selector.replace(/\s*[>+~]\s*/g, ' ').split(/\s+/);
  if (!matchesOne(parts.pop(), el)) return false;
  let at = 0;
  for (const part of parts.reverse()) {
    while (at < el.ancestors.length && !matchesOne(part, el.ancestors[at])) at++;
    if (at++ >= el.ancestors.length) return false;
  }
  return true;
}

/** The winning declaration of a property for an element, from rules in the order they load: { value, source, selector }. */
export function winner(all, el, property) {
  const setters = [property, ...(SHORTHANDS[property] ?? [])];
  let best;
  all.forEach((rule, order) => {
    for (const selector of rule.selectors) {
      if (!matches(selector, el)) continue;
      const spec = specificity(selector);
      for (const d of rule.declarations) {
        if (!setters.includes(d.property)) continue;
        const rank = [d.important ? 1 : 0, ...spec, order];
        if (!best || compare(rank, best.rank) >= 0) best = { rank, value: d.value, source: rule.source, selector };
      }
    }
  });
  return best;
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
