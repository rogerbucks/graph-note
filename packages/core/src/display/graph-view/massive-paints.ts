// Helpers of the overview of a graph too large to draw (editor spec §53, massive-view.ts).
import { word } from '@thoughtknot/core';
import type { DrawMark } from '../../drawing-marks.ts';
import type { Paint, Paints } from './mark-painter.ts';
import { openSpaceView } from './space-view-panel';
import { button } from './view-bar';

/**
 * The paint of each style, as plain colours a canvas takes. A host's colours may name its theme's variables, which a
 * canvas cannot read, so each is read back once through an element of the card.
 */
export function plainPaints(el: HTMLElement, paints: Paints): Paints {
  const probe = el.createSpan({ cls: 'thoughtknot-massive-probe' });
  const seen = new Map<string, string>();
  const plain = (css: string | undefined) => {
    if (!css) return undefined;
    let c = seen.get(css);
    if (c === undefined) {
      probe.setCssProps({ '--thoughtknot-probe': css });
      c = el.win.getComputedStyle(probe).color;
      seen.set(css, c);
    }
    return c;
  };
  const table = new Map<string, Paint>();
  return (style) => {
    let p = table.get(style);
    if (!p) {
      const { fill, line, text } = paints(style);
      p = { fill: plain(fill), line: plain(line), text: plain(text) };
      table.set(style, p);
    }
    return p;
  };
}

/**
 * The overview's 3D view button, in its tools (scale_space_view). It lifts the overview's marks as they are now, so
 * each group stands as a block. Back to 2D or Escape returns to `stage`.
 */
export function spaceButton(
  tools: HTMLElement,
  el: HTMLElement,
  graph: string,
  now: () => { marks: DrawMark[]; paints: Paints },
  stage: HTMLElement,
): void {
  button(tools, word('bar.space'), 'box', () => void openSpaceView(el, now(), graph, () => stage.focus()));
}
