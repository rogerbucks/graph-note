// The WCAG 2.2 AA check the tests run on every view and page of every host (editor spec §11; test/wcag.test.js). Test code
// only — nothing here ships. A view is put into a real DOM (jsdom), with the stylesheet that styles it and the colours of
// the theme it is shown in, and two checks run on it:
//   - axe-core, the accessibility checker, with the rules tagged WCAG 2.0, 2.1 and 2.2, A and AA. It reads the structure:
//     names, roles, labels, language, headings, ids, ARIA, links, tables and the like. Its colour and size rules need a
//     browser's layout, which jsdom has none of, so they are not run by it; they are done here instead or left, below.
//   - contrast (SC 1.4.3): the colour of every piece of text against the colour behind it, worked out from the stylesheet
//     with the theme's own variables put in, against 4.5:1 (3:1 for large text).
// Left to a real browser, and said so in the test: the contrast of lines and controls (SC 1.4.11), the size of targets
// (SC 2.5.8, held by the sheet's own 44-point cases), reflow and spacing (SC 1.4.10, 1.4.12).
import axe from 'axe-core';
import { JSDOM, VirtualConsole } from 'jsdom';
import { OBSIDIAN_TOKEN_MAP } from '../../packages/core/src/theme-tokens.ts';

export const THEMES = ['light', 'dark'];

/** Obsidian's default themes, as its app stylesheet sets them (read from the installed Obsidian on 16 Oct 2026). */
const BASE = {
  light: {
    '--color-base-00': '#ffffff',
    '--color-base-20': '#f6f6f6',
    '--color-base-30': '#e0e0e0',
    '--color-base-40': '#bdbdbd',
    '--color-base-50': '#ababab',
    '--color-base-70': '#5c5c5c',
    '--color-base-100': '#222222',
    '--color-red': '#e93147',
    '--color-orange': '#ec7500',
    '--color-green': '#08b94e',
    '--color-yellow': '#e0ac00',
    '--color-pink': '#d53984',
    '--color-blue': '#086ddd',
    '--color-cyan': '#00bfbc',
    '--color-purple': '#7852ee',
    '--color-base-10': '#fafafa',
  },
  dark: {
    '--color-base-00': '#1e1e1e',
    '--color-base-20': '#262626',
    '--color-base-30': '#363636',
    '--color-base-40': '#555555',
    '--color-base-50': '#666666',
    '--color-base-70': '#b3b3b3',
    '--color-base-100': '#dadada',
    '--color-red': '#fb464c',
    '--color-orange': '#e9973f',
    '--color-green': '#44cf6e',
    '--color-yellow': '#e0de71',
    '--color-pink': '#fa99cd',
    '--color-blue': '#027aff',
    '--color-cyan': '#53dfdd',
    '--color-purple': '#a882ff',
    '--color-base-10': '#242424',
  },
};

/** The variables of Obsidian's own that the plugin's stylesheet reads, for a theme, as Obsidian's default theme gives them. */
export function obsidianVariables(theme) {
  const b = BASE[theme];
  return {
    '--background-primary': b['--color-base-00'],
    '--background-secondary': b['--color-base-20'],
    '--background-modifier-border': b['--color-base-30'],
    '--background-modifier-border-focus': b['--color-base-40'],
    '--text-normal': b['--color-base-100'],
    '--text-muted': b['--color-base-70'],
    '--text-faint': b['--color-base-50'],
    '--text-error': b['--color-red'],
    '--text-warning': b['--color-orange'],
    '--text-on-accent': '#ffffff',
    '--text-selection': 'rgba(120, 82, 238, 0.25)',
    '--interactive-accent': 'hsl(258, 88%, 66%)',
    '--text-accent': 'hsl(258, 88%, 66%)',
    '--link-color': 'hsl(258, 88%, 66%)',
    '--link-unresolved-color': 'hsl(258, 88%, 66%)',
    '--color-red': b['--color-red'],
    '--color-orange': b['--color-orange'],
    '--color-green': b['--color-green'],
    '--color-pink': b['--color-pink'],
    '--color-blue': b['--color-blue'],
    '--color-cyan': b['--color-cyan'],
    '--color-purple': b['--color-purple'],
    '--color-yellow': b['--color-yellow'],
    '--code-background': b['--color-base-10'],
    '--code-normal': b['--color-base-100'],
    '--code-comment': b['--color-base-50'],
    '--code-function': b['--color-yellow'],
    '--code-important': b['--color-orange'],
    '--code-keyword': b['--color-pink'],
    '--code-operator': b['--color-red'],
    '--code-property': b['--color-cyan'],
    '--code-punctuation': b['--color-base-70'],
    '--code-string': b['--color-green'],
    '--code-tag': b['--color-red'],
    '--code-value': b['--color-purple'],
    '--font-ui-smaller': '12px',
    '--font-ui-small': '13px',
    '--font-ui-medium': '15px',
    '--font-bold': '600',
    '--font-semibold': '600',
    '--code-size': '13px',
  };
}

/**
 * A stylesheet with each var(--name) replaced by the value `variables` gives it, or its fallback; others are left. Each
 * `color-mix(in srgb, a p%, b)` of two colours then written out as the colour it makes, as a browser works it out, because
 * jsdom does not know the function.
 */
export function withVariables(css, variables) {
  let text = css;
  for (let pass = 0; pass < 4; pass += 1)
    text = text.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (whole, name, fallback) =>
      Object.hasOwn(variables, name) ? variables[name] : (fallback?.trim() ?? whole),
    );
  const colour = '(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\\([^)]*\\))';
  const mixed = new RegExp(`color-mix\\(\\s*in srgb\\s*,\\s*${colour}\\s+([\\d.]+)%\\s*,\\s*${colour}\\s*\\)`, 'g');
  const resolved = text.replace(mixed, (whole, a, percent, b) => {
    const [x, y] = [parseColour(a), parseColour(b)];
    if (!x || !y) throw new Error(`color-mix with a colour this check cannot read: ${whole}`);
    const p = parseFloat(percent) / 100;
    const channels = [0, 1, 2].map((i) => Math.round(x[i] * p + y[i] * (1 - p)));
    return `rgb(${channels.join(', ')})`;
  });
  const left = /color-mix\([^;}]*/.exec(resolved);
  if (left) throw new Error(`color-mix this check cannot read: ${left[0]}`);
  return resolved;
}

/**
 * A stylesheet with each design token it reads written as the variable of Obsidian's theme the token is mapped from
 * (theme-tokens.ts, `OBSIDIAN_TOKEN_MAP`), its fallback kept: what the token gives in Obsidian, for a check that cannot
 * follow one custom property to another.
 */
export function withObsidianNames(css) {
  return css.replace(/var\(\s*(--gn-[\w-]+)/g, (whole, name) =>
    Object.hasOwn(OBSIDIAN_TOKEN_MAP, name) ? `var(${OBSIDIAN_TOKEN_MAP[name]}` : whole,
  );
}

const escapeText = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (t) => escapeText(t).replace(/"/g, '&quot;');
/** Elements that never have content, written without an end tag. */
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);

/** A fake-DOM element (packages/obsidian/test/host/fake-dom.js) as HTML text. */
export function toHtml(el) {
  if (el.tagName === '#TEXT') return escapeText(el.text);
  const tag = el.localName;
  const attributes = new Map(el.attributes);
  const style = Object.entries(el.cssProps ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  if (style) attributes.set('style', style);
  if (el._value !== undefined && tag === 'input') attributes.set('value', el._value);
  const open = [...attributes].map(([k, v]) => (v === '' ? k : `${k}="${escapeAttr(v)}"`)).join(' ');
  const head = `<${tag}${open ? ` ${open}` : ''}>`;
  if (VOID.has(tag)) return head;
  const own = el._value !== undefined && tag === 'textarea' ? el._value : el.text;
  return `${head}${escapeText(own)}${el.children.map(toHtml).join('')}</${tag}>`;
}

// ── colour ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** [r, g, b, alpha] from a CSS colour, or null where it is not one this check reads (so it is not guessed at). */
export function parseColour(text) {
  const t = String(text ?? '')
    .trim()
    .toLowerCase();
  if (NAMED[t]) return NAMED[t];
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m) {
    const h = m[1].length <= 4 ? [...m[1]].map((c) => c + c).join('') : m[1];
    if (h.length !== 6 && h.length !== 8) return null;
    const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return [...v, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/.exec(t);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const num = (s, scale) => (s.endsWith('%') ? (parseFloat(s) / 100) * scale : parseFloat(s));
    if (p.length < 3) return null;
    return [num(p[0], 255), num(p[1], 255), num(p[2], 255), p[3] === undefined ? 1 : num(p[3], 1)];
  }
  m = /^hsla?\(([^)]+)\)$/.exec(t);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const [r, g, b] = hslToRgb(parseFloat(p[0]), parseFloat(p[1]) / 100, parseFloat(p[2]) / 100);
    return [r, g, b, p[3] === undefined ? 1 : parseFloat(p[3])];
  }
  return null;
}

/** `top` laid over the opaque colour `under`. */
const over = (top, under) => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a));
};

const luminance = (c) => {
  const [r, g, b] = c.slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** The contrast ratio of two opaque colours, as WCAG 2.2 works it out. */
export const contrastRatio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// ── the DOM ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A page for a view: the view's HTML inside a document with a language and a title (the host gives these in Obsidian), the
 * stylesheets written out with the theme's variables, the theme's class on the body and its page colour behind.
 */
export function pageFor({ html, css, theme, title = 'Graph Note view', lang = 'en' }) {
  const vars = obsidianVariables(theme);
  const style = withVariables(withObsidianNames(css), vars);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escapeText(title)}</title><style>${style}</style></head><body class="theme-${theme}" style="background-color: ${vars['--background-primary']}; color: ${vars['--text-normal']}">${html}</body></html>`;
}

/** A DOM for a page's text, with nothing from jsdom written to the console: what it cannot do is not a finding. */
export function openWindow(text, options = {}) {
  return new JSDOM(text, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    ...options,
  });
}

/**
 * The browser page's style sheet for one theme (theme-css.ts writes both): the light variables, or, for the dark theme,
 * the ones the dark scheme sets, which jsdom cannot ask for by media query; and each var() written out.
 */
export function pageStyleFor(css, theme) {
  const dark = /@media \(prefers-color-scheme: dark\)\s*\{(:root\s*\{[^}]*\})\s*\}/.exec(css);
  if (!dark) throw new Error('the page style sheet has no dark scheme to try');
  // the theme's variables and the page's design tokens, mapped from them (page.css), are each a :root block
  const rootOf = (text) => [...text.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]).join(';');
  const light = rootOf(css.replace(dark[0], ''));
  const declared = Object.fromEntries(
    [light, ...(theme === 'dark' ? [rootOf(dark[1])] : [])].flatMap((block) =>
      block
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d.startsWith('--'))
        .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]),
    ),
  );
  return { style: withVariables(css.replace(dark[0], ''), declared), variables: declared };
}

/** The axe rules to run: those tagged WCAG 2.0, 2.1 or 2.2 at A or AA. The rules that need a layout are skipped, below. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** Rules that need a browser's layout and paint: colour is checked here, target size and the like in a real browser. */
const NEEDS_LAYOUT = ['color-contrast', 'color-contrast-enhanced', 'target-size', 'scrollable-region-focusable'];

/** The text of every element that shows text of its own, with the colours behind and in front of it. */
function contrastProblems(window, theme, background) {
  const { document } = window;
  const problems = [];
  const page = parseColour(background);
  const computed = (e, property) => window.getComputedStyle(e).getPropertyValue(property);
  const hidden = (e) => {
    for (let a = e; a && a.nodeType === 1; a = a.parentElement)
      if (a.hasAttribute('hidden') || computed(a, 'display') === 'none' || computed(a, 'visibility') === 'hidden')
        return true;
    return false;
  };
  const colourOf = (e) => {
    for (let a = e; a && a.nodeType === 1; a = a.parentElement) {
      const c = computed(a, 'color');
      if (c) return c;
    }
    return null;
  };
  const backgroundOf = (e) => {
    const layers = [];
    for (let a = e; a && a.nodeType === 1; a = a.parentElement) {
      const bg = parseColour(computed(a, 'background-color'));
      if (bg && bg[3] > 0) layers.push(bg);
      if (bg && bg[3] === 1) break;
    }
    return layers.reverse().reduce((under, layer) => over(layer, under), page.slice(0, 3));
  };
  const sizeOf = (e) => {
    for (let a = e; a && a.nodeType === 1; a = a.parentElement) {
      const m = /^([\d.]+)px$/.exec(computed(a, 'font-size'));
      if (m) return parseFloat(m[1]);
    }
    return 16;
  };
  const weightOf = (e) => {
    for (let a = e; a && a.nodeType === 1; a = a.parentElement) {
      const w = computed(a, 'font-weight');
      if (w) return w === 'bold' ? 700 : parseInt(w, 10) || 400;
    }
    return 400;
  };
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('svg') || e.closest('script, style')) continue;
    const text = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!text || hidden(e) || e.matches(':disabled') || e.getAttribute('aria-disabled') === 'true') continue;
    const fore = parseColour(colourOf(e) ?? '');
    if (!fore) {
      problems.push(`${describe(e)}: a text colour this check cannot read (${colourOf(e)})`);
      continue;
    }
    // text painted in no colour is not seen: a field over its coloured picture (the picture's own text is checked)
    if (fore[3] === 0) continue;
    const back = backgroundOf(e);
    const ratio = contrastRatio(over(fore, back), back);
    const large = sizeOf(e) >= 24 || (sizeOf(e) >= 18.66 && weightOf(e) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need)
      problems.push(`${describe(e)} in the ${theme} theme: contrast ${ratio.toFixed(2)}:1, needs ${need}:1 (SC 1.4.3)`);
  }
  return problems;
}

/** An Obsidian view (a fake-DOM element) in `theme`, with the plugin's styles: checked as `audit` checks a page. */
export function auditView(el, css, theme) {
  const dom = openWindow(pageFor({ html: toHtml(el), css, theme }));
  return audit(dom, theme, obsidianVariables(theme)['--background-primary']);
}

/** A short name for an element in a report: its tag, its classes and the start of its words. */
function describe(e) {
  const classes = [...e.classList].slice(0, 3).join('.');
  return `<${e.localName}${classes ? `.${classes}` : ''}> “${e.textContent.trim().slice(0, 30)}”`;
}

/**
 * Checks the page in `dom`, then closes it: {problems, rules}. `problems` is one line for each failure, from axe (its rule,
 * the WCAG criteria and the element) or from the contrast check; `rules` is how many axe rules ran, so a test can see that
 * the check looked at something. `background` is the colour behind the page, as text.
 */
export async function audit(dom, theme, background) {
  try {
    const { window } = dom;
    window.eval(axe.source);
    const result = await window.axe.run(window.document, {
      runOnly: { type: 'tag', values: TAGS },
      rules: Object.fromEntries(NEEDS_LAYOUT.map((id) => [id, { enabled: false }])),
      resultTypes: ['violations', 'passes'],
    });
    const criteria = (v) => v.tags.filter((t) => /^wcag\d{3,}$/.test(t)).join(', ') || v.impact;
    const found = result.violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id} (${criteria(v)}): ${n.target.join(' ')} — ${v.help}`),
    );
    return {
      problems: [...found, ...contrastProblems(window, theme, background)],
      rules: result.passes.length + result.violations.length,
    };
  } finally {
    dom.window.close();
  }
}
