// Links that move, on the drawing (spec §7, links_show_flow, motion_not_alone, motion_reduced_respected). Each link the
// style graph moves is marked by class for `styles.css` to run its dashes, or a dot along a copy of its line. So the
// line itself stays. Each is named for a screen reader with its movement and what it means. The card's legend says each
// in words beside its icon. The movement is the style sheet's alone, stopped under reduced motion, where the dot is
// hidden.
import { flowLegend, flowSaid } from '@thoughtknot/core';
import type { FlowLink } from '@thoughtknot/core';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * A copy of the line of link group `g`, last in it, for a dot to travel. Its length is counted as 100, so the style
 * sheet's dash pattern puts one dot on it. Null when the group draws no line.
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
 * A written link's group in the drawing, by its index among the links. Graphviz numbers them `edge1`, `edge2`… in the
 * order written. A link guessed from a near miss of its type is among them, and has no `data-link` (drawing-svg.ts).
 */
export const linkGroup = (svg: Element | undefined, index: number): Element | null =>
  svg?.querySelector(`g.edge[id="edge${index + 1}"]`) ?? null;

/**
 * Every group that draws a written link: its own, and first its line from its thing to the trunk (`edgeN_tail`). That
 * line is for a link merged into a trunk by the View menu (§25). So the two are in the order the line runs.
 */
export const linkGroups = (svg: Element | undefined, index: number): Element[] =>
  [`edge${index + 1}_tail`, `edge${index + 1}`].flatMap((id) => {
    const g = svg?.querySelector(`g.edge[id="${id}"]`);
    return g ? [g] : [];
  });

/**
 * The links of `svg` that `flow` moves (each a written link, by its place, a guessed one too), marked. Each gets the
 * classes the style sheet moves them by, and its name with the movement and its meaning. A dot also gets its runner.
 * The runner is drawn whatever the system asks, and `styles.css` hides it under reduced motion. So turning that off
 * moves it at once.
 */
export function markFlow(svg: SVGSVGElement, flow: readonly FlowLink[]): void {
  for (const f of flow)
    for (const g of linkGroups(svg, f.index)) {
      g.classList.add('thoughtknot-flow', `thoughtknot-flow-${f.motion}`);
      g.setAttribute('aria-label', `${g.getAttribute('aria-label') ?? ''}, ${flowSaid(f)}`);
      if (f.motion === 'dot') runnerOn(g, 'thoughtknot-flow-runner');
    }
}

/**
 * The card's legend of what moves: each movement and its meaning once, its icon beside the words. None when none moves.
 * A link `folded` into a stub or a box by the View menu (§25) is not drawn, so not said.
 */
export function renderFlowLegend(root: HTMLElement, flow: readonly FlowLink[], folded: readonly number[] = []): void {
  const entries = flowLegend(flow.filter((f) => !folded.includes(f.index)));
  if (!entries.length) return;
  const ul = root.createEl('ul', {
    cls: 'thoughtknot-flow-legend',
    attr: { 'aria-label': 'What the moving links mean' },
  });
  for (const e of entries) {
    const li = ul.createEl('li');
    li.createSpan({ cls: 'thoughtknot-flow-icon', text: e.icon, attr: { 'aria-hidden': 'true' } });
    li.appendText(` ${flowSaid(e)}`);
  }
}
