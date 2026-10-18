// The pictures the visual check compares (editor spec §41, visual_regression_auto). Each is one drawing of a view, in a
// theme, written as plain SVG text that says only what is seen.
//
// Every shape keeps its geometry and its words. Its paint is written onto it as the page works it out from the real
// stylesheet. The paint is the fill, the stroke, their opacity, the stroke's width and dashes, and the text's colour,
// size and weight. Each var() and color-mix() becomes one rgb colour. Classes, ids, names for a screen reader and other
// markup that paints nothing are left out. Each number is rounded to a hundredth, so a picture changes only when what
// is drawn does.
import { parseColour, withVariables } from './wcag.js';

/** The SVG elements that paint, or group what does. */
const DRAWN = new Set([
  'svg',
  'g',
  'path',
  'polygon',
  'polyline',
  'line',
  'rect',
  'circle',
  'ellipse',
  'text',
  'tspan',
  'image',
  'use',
  'defs',
  'marker',
  'clippath',
  'lineargradient',
  'radialgradient',
  'stop',
  'pattern',
]);
/** The attributes that place or size a shape. */
const GEOMETRY = [
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'transform',
  'dx',
  'dy',
  'text-anchor',
  'dominant-baseline',
  'offset',
  'markerWidth',
  'markerHeight',
  'refX',
  'refY',
  'orient',
  'href',
  'xlink:href',
];
/** The paint each shape is drawn with, as the page computes it. */
const PAINT = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'opacity',
  'font-size',
  'font-weight',
  'font-style',
  'color',
  'display',
  'visibility',
];

const round = (text) => text.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 100) / 100));
const rgb = (c) =>
  c[3] === 1
    ? `rgb(${c.slice(0, 3).map(Math.round).join(', ')})`
    : `rgba(${c.slice(0, 3).map(Math.round).join(', ')}, ${Math.round(c[3] * 100) / 100})`;

/**
 * The theme's variables, with the channels of each of its colours as Obsidian gives them (`--color-cyan-rgb: 0, 191,
 * 188`), which the drawing's fills are written in.
 */
export function withChannels(variables) {
  const out = { ...variables };
  for (const [name, value] of Object.entries(variables)) {
    const c = /^--color-[a-z]+$/.test(name) && parseColour(value);
    if (c) out[`${name}-rgb`] ??= c.slice(0, 3).map(Math.round).join(', ');
  }
  return out;
}

/** A computed value with its variables and colour mixes worked out, and each colour written as rgb(). */
const paintOf = (value, variables) =>
  round(
    withVariables(value, variables).replace(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)/gi, (c) =>
      parseColour(c) ? rgb(parseColour(c)) : c,
    ),
  );

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * The picture of `svg`, an element of a page open in `window` with the theme's stylesheet and `variables`. It is one
 * element a line, indented by its depth. Each line gives only the paint that differs from the element it is in. Ids a
 * shape points to (a marker, a clip, a gradient) are numbered in the order they appear.
 */
export function pictureOf(window, svg, themeVariables) {
  const variables = withChannels(themeVariables);
  const ids = new Map();
  const idOf = (id) => {
    if (!ids.has(id)) ids.set(id, `p${ids.size + 1}`);
    return ids.get(id);
  };
  const lines = [];
  const walk = (el, depth, above = {}) => {
    const tag = el.localName.toLowerCase();
    if (!DRAWN.has(tag)) return;
    const style = window.getComputedStyle(el);
    if (style.display === 'none') return;
    const parts = [];
    if (el.id) parts.push(`id="${idOf(el.id)}"`);
    for (const name of GEOMETRY) {
      const value = el.getAttribute(name);
      if (value === null) continue;
      const pointed = value
        .replace(/^#(.+)$/, (_, id) => `#${idOf(id)}`)
        .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${idOf(id)})`);
      parts.push(`${name}="${escape(round(pointed))}"`);
    }
    for (const name of ['marker-start', 'marker-mid', 'marker-end', 'clip-path']) {
      const value = el.getAttribute(name) ?? style.getPropertyValue(name);
      if (value && value !== 'none')
        parts.push(`${name}="${value.replace(/url\(["']?#([^)"']+)["']?\)/g, (_, id) => `url(#${idOf(id)})`)}"`);
    }
    const own = {};
    for (const p of PAINT) {
      const v = style.getPropertyValue(p);
      if (v !== '') own[p] = paintOf(v, variables);
    }
    const paint = Object.entries(own).filter(([p, v]) => above[p] !== v);
    if (paint.length) parts.push(`paint="${escape(paint.map(([p, v]) => `${p}:${v}`).join(';'))}"`);
    const words = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join('')
      .trim();
    lines.push(
      `${'  '.repeat(depth)}<${tag}${parts.length ? ` ${parts.join(' ')}` : ''}>${words ? ` ${escape(words)}` : ''}`,
    );
    for (const child of el.children) walk(child, depth + 1, own);
  };
  walk(svg, 0);
  return `${lines.join('\n')}\n`;
}

/** Every drawing a view shows: each outermost svg drawn by the drawing layer, in the order of the page. */
export const drawingsIn = (root) =>
  [...root.querySelectorAll('svg.thoughtknot-svg')].filter((svg) => !svg.parentElement.closest('svg'));
