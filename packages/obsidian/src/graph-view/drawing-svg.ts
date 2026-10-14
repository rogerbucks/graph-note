// The drawing itself (spec §3, §11): the SVG the engine drew, put in the viewport, with each box and each link — written
// or estimated — made reachable from the keyboard and named for screen readers, and the drawing told as sentences. A
// drawing folded by the View menu (§25) has a stub for each busy hub and a box for each group folded, each a button
// that opens it; a link merged into a trunk is tapped and named as itself by either of its lines. Laid out again, the
// drawing is put in the same SVG element (`swapSvg`), so everything that holds it holds the new drawing.
import { textVersion, withoutColorMix } from '@graph-note/core';
import type { Drawn, Folding, GraphDrawing } from '@graph-note/core';
import { boxLabel } from './suggested-name';
import { markParked } from './parked';

let described = 0;

/** The SVG text parsed into an element of the page, its blends plain where the browser cannot mix colours. */
function parsed(drawn: Drawn): SVGSVGElement {
  // CSS color-mix arrived in iOS 16.2, and Obsidian runs on iOS 15: without it a blend would draw black, so use the plain hue
  const mixes = typeof CSS === 'undefined' || CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
  const svg = new DOMParser().parseFromString(
    mixes ? drawn.svg : withoutColorMix(drawn.svg),
    'image/svg+xml',
  ).documentElement;
  return activeDocument.importNode(svg, true) as unknown as SVGSVGElement;
}

/** The drawing, parsed from its SVG text into the viewport, each box and link made reachable from the keyboard and named. */
export function insertSvg(
  viewport: HTMLElement,
  drawn: Drawn,
  d: GraphDrawing | undefined,
  plan?: Folding,
): SVGSVGElement {
  const svg = viewport.appendChild(parsed(drawn));
  svg.removeAttribute('style');
  svg.classList.add('graph-note-svg');
  decorate(svg, drawn, d, plan);
  return svg;
}

/** The drawing laid out again (§25): its new SVG put in place of the old, inside the same element, and marked as before. */
export function swapSvg(svg: SVGSVGElement, drawn: Drawn, d: GraphDrawing | undefined, plan?: Folding): void {
  const fresh = parsed(drawn);
  svg.replaceChildren(...Array.from(fresh.children));
  const box = fresh.getAttribute('viewBox');
  if (box) svg.setAttribute('viewBox', box);
  decorate(svg, drawn, d, plan);
}

/** Each box and link of a drawing made reachable from the keyboard and named, and its folds made buttons. */
function decorate(svg: SVGSVGElement, drawn: Drawn, d: GraphDrawing | undefined, plan?: Folding): void {
  svg.classList.toggle('graph-note-down', drawn.rankdir === 'TB'); // labels sit beside their lines, so they are given a gap
  const boxes = d?.boxes ?? [];
  for (const g of Array.from(svg.querySelectorAll('g.node'))) {
    const box = boxes[Number(/^node(\d+)$/.exec(g.getAttribute('id') ?? '')?.[1]) - 1];
    if (!box) continue;
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', boxLabel(box));
    g.setAttribute('data-key', box.key);
    g.setAttribute('aria-pressed', 'false');
  }
  // links: each written link in order, then the estimated ones added to the drawing (spec §3)
  const written = d?.links.length ?? 0,
    named = (d?.estimates ?? []).filter((e) => e.kind === 'name');
  const textOf = (k: string) => boxes.find((b) => b.key === k)?.text ?? k;
  for (const g of Array.from(svg.querySelectorAll('g.edge'))) {
    const [, number, tail] = /^edge(\d+)(_tail)?$/.exec(g.getAttribute('id') ?? '') ?? [];
    const n = Number(number) - 1;
    const e = n < written ? d?.estimates.find((x) => x.kind === 'type' && x.index === n) : named[n - written];
    const l = n < written ? d?.links[n] : undefined;
    if (!e && l) {
      // a written link: tap it, or press Enter on it, for its details; merged into a trunk, either of its lines (§25)
      g.setAttribute('data-link', String(n));
      g.setAttribute('aria-label', `Link: ${textOf(l.from)} ${l.reading} ${textOf(l.to)}`);
      if (tail) continue;
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-pressed', 'false');
      continue;
    }
    if (!e || !d) continue;
    g.setAttribute('data-estimate', String(d.estimates.indexOf(e)));
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-pressed', 'false'); // selected as a written link is, when tapped
    g.setAttribute('aria-label', `Estimated link: ${textOf(e.from)} ${e.reading} ${textOf(e.to)}. Open it for why.`);
  }
  markFolds(svg, plan, textOf);
  markParked(svg, boxes); // things parked for later: dashed, with a later mark (spec §5)
}

/** Each busy hub's stub and each folded group's box (§25): a button that opens it, named with its count. */
function markFolds(svg: SVGSVGElement, plan: Folding | undefined, textOf: (k: string) => string): void {
  if (!plan) return;
  const folds: [string, string, string][] = [
    ...plan.hubs.map(([key, count], j): [string, string, string] => [
      `fold_hub_${j + 1}`,
      `hub:${key}`,
      `${textOf(key)}: ${count} link${count === 1 ? '' : 's'} folded. Open them.`,
    ]),
    ...plan.groups.flatMap(([label, things, folded], i): [string, string, string][] =>
      folded
        ? [
            [
              `fold_group_${i + 1}`,
              `group:${label}`,
              `${label}: ${things.length} thing${things.length === 1 ? '' : 's'} folded. Open the group.`,
            ],
          ]
        : [],
    ),
  ];
  for (const [id, fold, label] of folds) {
    const g = svg.querySelector(`#${id}`);
    if (!g) continue;
    g.setAttribute('data-fold', fold);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', label);
    svg.querySelector(`#${id}_link`)?.setAttribute('data-fold', fold);
  }
}

/** The drawing as sentences, for screen readers (spec §11), named as the viewport's description. */
export function describeDrawing(root: HTMLElement, viewport: HTMLElement, d: GraphDrawing): void {
  const sr = root.createDiv({ cls: 'graph-note-sr', attr: { id: `graph-note-sr-${++described}` } });
  const ul = sr.createEl('ul');
  for (const line of textVersion(d)) ul.createEl('li', { text: line });
  viewport.setAttribute('aria-describedby', sr.getAttribute('id') ?? '');
}
