// Links that move, on the drawing (spec §7, links_show_flow, motion_not_alone, motion_reduced_respected): each link the
// style graph moves marked by class for `styles.css` to run its dashes, or a dot along a copy of its line, so the line
// itself stays; named for a screen reader with its movement and what it means; and the card's legend saying each in
// words beside its icon. The movement is the style sheet's alone, stopped under reduced motion, where the dot is hidden.
import { flowLegend, flowSaid } from '@graph-note/core';
import type { FlowLink } from '@graph-note/core';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * A copy of the line of link group `g`, last in it, for a dot to travel: its length counted as 100, so the style sheet's
 * dash pattern puts one dot on it. Null when the group draws no line.
 */
export function runnerOn(g: Element, cls: string, more = ''): SVGPathElement | null {
  const line = Array.from(g.querySelectorAll('path')).find((p) => !p.classList.contains(cls));
  if (!line) return null;
  const runner = activeDocument.createElementNS(SVG, 'path');
  runner.setAttribute('d', line.getAttribute('d') ?? '');
  runner.setAttribute('pathLength', '100');
  runner.setAttribute('class', more ? `${cls} ${more}` : cls);
  g.appendChild(runner);
  return runner;
}

/**
 * A written link's group in the drawing, by its index among the links: Graphviz numbers them `edge1`, `edge2`… in the
 * order written, a link guessed from a near miss of its type among them, which has no `data-link` (drawing-svg.ts).
 */
export const linkGroup = (svg: Element | undefined, index: number): Element | null =>
  svg?.querySelector(`g.edge[id="edge${index + 1}"]`) ?? null;

/**
 * The links of `svg` that `flow` moves (each a written link, by its place, a guessed one too), marked: the classes the
 * style sheet moves them by, their name with the movement and its meaning, and, for a dot, its runner. The runner is
 * drawn whatever the system asks, and `styles.css` hides it under reduced motion, so turning that off moves it at once.
 */
export function markFlow(svg: SVGSVGElement, flow: readonly FlowLink[]): void {
  for (const f of flow) {
    const g = linkGroup(svg, f.index);
    if (!g) continue;
    g.classList.add('graph-note-flow', `graph-note-flow-${f.motion}`);
    g.setAttribute('aria-label', `${g.getAttribute('aria-label') ?? ''}, ${flowSaid(f)}`);
    if (f.motion === 'dot') runnerOn(g, 'graph-note-flow-runner');
  }
}

/** The card's legend of what moves: each movement and its meaning once, its icon beside the words. None when none moves. */
export function renderFlowLegend(root: HTMLElement, flow: readonly FlowLink[]): void {
  const entries = flowLegend(flow);
  if (!entries.length) return;
  const ul = root.createEl('ul', {
    cls: 'graph-note-flow-legend',
    attr: { 'aria-label': 'What the moving links mean' },
  });
  for (const e of entries) {
    const li = ul.createEl('li');
    li.createSpan({ cls: 'graph-note-flow-icon', text: e.icon, attr: { 'aria-hidden': 'true' } });
    li.appendText(` ${flowSaid(e)}`);
  }
}
