// The drawing itself (spec §3, §11): the SVG the engine drew, put in the viewport, with each box and each link — written
// or estimated — made reachable from the keyboard and named for screen readers, and the drawing told as sentences.
import { textVersion, withoutColorMix } from '@graph-note/core';
import type { Drawn, GraphDrawing } from '@graph-note/core';
import { boxLabel } from './suggested-name';
import { markParked } from './parked';

let described = 0;

/** The drawing, parsed from its SVG text into the viewport, each box and link made reachable from the keyboard and named. */
export function insertSvg(viewport: HTMLElement, drawn: Drawn, d: GraphDrawing | undefined): SVGSVGElement {
  // CSS color-mix arrived in iOS 16.2, and Obsidian runs on iOS 15: without it a blend would draw black, so use the plain hue
  const mixes = typeof CSS === 'undefined' || CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
  const parsed = new DOMParser().parseFromString(
    mixes ? drawn.svg : withoutColorMix(drawn.svg),
    'image/svg+xml',
  ).documentElement;
  const svg = viewport.appendChild(activeDocument.importNode(parsed, true)) as unknown as SVGSVGElement;
  svg.removeAttribute('style');
  svg.classList.add('graph-note-svg');
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
    const n = Number(/^edge(\d+)$/.exec(g.getAttribute('id') ?? '')?.[1]) - 1;
    const e = n < written ? d?.estimates.find((x) => x.kind === 'type' && x.index === n) : named[n - written];
    const l = n < written ? d?.links[n] : undefined;
    if (!e && l) {
      // a written link: tap it, or press Enter on it, for its details
      g.setAttribute('data-link', String(n));
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-pressed', 'false');
      g.setAttribute('aria-label', `Link: ${textOf(l.from)} ${l.reading} ${textOf(l.to)}`);
      continue;
    }
    if (!e || !d) continue;
    g.setAttribute('data-estimate', String(d.estimates.indexOf(e)));
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `Estimated link: ${textOf(e.from)} ${e.reading} ${textOf(e.to)}. Open it for why.`);
  }
  markParked(svg, boxes); // things parked for later: dashed, with a later mark (spec §5)
  return svg;
}

/** The drawing as sentences, for screen readers (spec §11), named as the viewport's description. */
export function describeDrawing(root: HTMLElement, viewport: HTMLElement, d: GraphDrawing): void {
  const sr = root.createDiv({ cls: 'graph-note-sr', attr: { id: `graph-note-sr-${++described}` } });
  const ul = sr.createEl('ul');
  for (const line of textVersion(d)) ul.createEl('li', { text: line });
  viewport.setAttribute('aria-describedby', sr.getAttribute('id') ?? '');
}
