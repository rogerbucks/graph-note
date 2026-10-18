// What the tests of the viewer aids (editor spec §24, §25: the quick-info tooltip) do by hand.
// - Hold the card's timers, so a hover or a long press is let go by the test and not by the clock.
// - Find the tooltip.
// - Work out where a box or link is on the page, to see that the tooltip never covers it.

/**
 * Holds every timer the card sets through its window from now on. None runs until `fire()`, which runs them all, once.
 * So a hover's delay or a long press is passed by the test, never waited for. `pending()` counts those still held.
 */
export function clock(env) {
  const win = env.doc.defaultView,
    held = [];
  win.setTimeout = (fn) => held.push(fn);
  win.clearTimeout = (id) => {
    if (typeof id === 'number') held[id - 1] = null;
  };
  return {
    fire() {
      const now = held.splice(0);
      for (const fn of now) fn?.();
    },
    pending: () => held.filter(Boolean).length,
  };
}

/** The tooltip on the page, if the card has made one: it goes on the page itself, so it is never clipped by the card. */
export const tipOf = (env) => env.doc.body.querySelector('.thoughtknot-quick-info');
/** Whether the tooltip is open. */
export const open = (env) => {
  const t = tipOf(env);
  return !!t && !t.hidden;
};

/** The box whose key is given. */
export const thing = (el, key) => el.querySelectorAll('g.node').find((n) => n.getAttribute('data-key') === key);
/** The link whose number is given. */
export const link = (el, n) => el.querySelector(`g.edge[data-link="${n}"]`);

/** A pointer arriving on, or leaving, an element of the drawing. */
export const pointerOver = (g, pointerType = 'mouse') =>
  g.dispatch('pointerover', { target: g.children[0] ?? g, pointerType });
export const pointerOut = (g, pointerType = 'mouse') =>
  g.dispatch('pointerout', { target: g.children[0] ?? g, pointerType });

/** A finger (or pen) put down on an element, and lifted. */
export const touchDown = (el, g, at = { x: 20, y: 20 }, pointerId = 7) =>
  el
    .querySelector('.thoughtknot-viewport')
    .dispatch('pointerdown', { target: g, pointerId, pointerType: 'touch', clientX: at.x, clientY: at.y, button: 0 });
export const touchMove = (el, g, at, pointerId = 7) =>
  el
    .querySelector('.thoughtknot-viewport')
    .dispatch('pointermove', { target: g, pointerId, pointerType: 'touch', clientX: at.x, clientY: at.y });
export const touchUp = (el, g, at = { x: 20, y: 20 }, pointerId = 7) =>
  el
    .querySelector('.thoughtknot-viewport')
    .dispatch('pointerup', { target: g, pointerId, pointerType: 'touch', clientX: at.x, clientY: at.y, button: 0 });

/** The numbers in a string, in order. */
const nums = (s) => (s?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/**
 * Where an element of the drawing is on the page. It is the box round its polygons, paths and ellipses (a link's curve
 * and arrowhead, a box's outline). It is found from the SVG as the plugin draws it and the card's view of it.
 */
export function pageRect(el, g) {
  const svg = el.querySelector('svg'),
    [vx, vy, vw, vh] = nums(svg.getAttribute('viewBox')),
    t = el.querySelector('g.graph')?.getAttribute('transform') ?? '',
    [sx, sy = sx] = nums(/scale\(([^)]*)\)/.exec(t)?.[1] ?? '1'),
    [tx, ty] = nums(/translate\(([^)]*)\)/.exec(t)?.[1] ?? '0 0');
  const xs = [],
    ys = [];
  const take = (ns) => {
    for (let i = 0; i + 1 < ns.length; i += 2) {
      xs.push(sx * (ns[i] + tx));
      ys.push(sy * (ns[i + 1] + ty));
    }
  };
  for (const p of g.querySelectorAll('polygon')) take(nums(p.getAttribute('points')));
  for (const p of g.querySelectorAll('path')) take(nums(p.getAttribute('d')));
  for (const e of g.querySelectorAll('ellipse')) {
    const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map((a) => Number(e.getAttribute(a)));
    take([cx - rx, cy - ry, cx + rx, cy + ry]);
  }
  const vp = el.querySelector('.thoughtknot-viewport'),
    at = vp.getBoundingClientRect(),
    kx = Number(svg.getAttribute('width')) / vw,
    ky = Number(svg.getAttribute('height')) / vh,
    ox = parseFloat(vp.cssProps['--thoughtknot-x'] ?? '0') + at.left,
    oy = parseFloat(vp.cssProps['--thoughtknot-y'] ?? '0') + at.top;
  return {
    left: (Math.min(...xs) - vx) * kx + ox,
    right: (Math.max(...xs) - vx) * kx + ox,
    top: (Math.min(...ys) - vy) * ky + oy,
    bottom: (Math.max(...ys) - vy) * ky + oy,
  };
}

/** Where the tooltip is on the page: from the place the card sets it at, and the size the page gives it. */
export function tipRect(env) {
  const t = tipOf(env),
    size = t.getBoundingClientRect(),
    left = parseFloat(t.cssProps['--thoughtknot-qi-x']),
    top = parseFloat(t.cssProps['--thoughtknot-qi-y']);
  return { left, top, right: left + size.width, bottom: top + size.height };
}

/** Whether two rectangles share any area. */
export const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
