// Growing the overview from one thing (editor spec §53, scale_expand_on_demand). Once the view has flown to a thing,
// a bar offers its neighbours, one step out at a time, and a step back. The thing and what was added are laid out on
// their own and shown in a box around the thing, over the overview. The rings themselves are core
// expand-on-demand.ts; massive-view.ts lays them out and flies.
import { word } from '@thoughtknot/core';
import type { GraphDrawing } from '@thoughtknot/core';
import { Expansion } from '../../expand-on-demand.ts';
import type { Rect } from '../../search-fly.ts';
import { button } from '../button';

/** The id of the box the grown picture is shown in. */
export const GROWN = 'grown';

/** What the bar needs from the overview it sits in. */
export interface GrowHooks {
  drawing: GraphDrawing;
  /** Lays `part` out on its own and shows it in `box` as group `id`, in place of any shown before. False if it cannot. */
  layIn(id: string, part: GraphDrawing, box: Rect): Promise<boolean>;
  /** Flies the view to `place`. */
  flyOnto(place: Rect): Promise<void>;
  say(text: string): void;
  /** Called once a step out or back is shown, for the trail. */
  stepped(): void;
}

/** Where a picture was grown from and how far, so the bar can be put back as it was. */
export interface GrowState {
  key: string;
  name: string;
  place: Rect;
  steps: number;
}

/** The box around `place` that a picture of `count` things is shown in: larger as it holds more. */
export function grownBox(place: Rect, count: number): Rect {
  const side = Math.max(place.width, place.height) * (3 + 1.5 * Math.sqrt(count));
  const cx = place.x + place.width / 2,
    cy = place.y + place.height / 2;
  return { x: cx - side / 2, y: cy - side / 2, width: side, height: side };
}

/** The bar that grows the picture from a thing, at the end of `parent`. Hidden until `start` names a thing. */
export function growBar(
  parent: HTMLElement,
  h: GrowHooks,
): {
  start(key: string, name: string, place: Rect): void;
  state(): GrowState | null;
  restore(s: GrowState | null): void;
} {
  const bar = parent.createDiv({ cls: 'thoughtknot-massive-grow', attr: { role: 'toolbar' } });
  bar.hidden = true;
  let x: Expansion | null = null,
    name = '',
    anchor: Rect = { x: 0, y: 0, width: 1, height: 1 };

  const show = async () => {
    if (!x) return;
    const box = grownBox(anchor, x.keys().length);
    if (!(await h.layIn(GROWN, x.part(), box))) return h.say(word('massive.grow-too-large', { name }));
    const cut = x.cut.at(-1) ?? 0;
    h.say(word(cut ? 'massive.grown-cut' : 'massive.grown', { name, count: x.keys().length - 1, cut }));
    await h.flyOnto(box);
    h.stepped();
  };
  button(
    bar,
    word('massive.more'),
    'network',
    () => {
      if (!x) return;
      if (!x.grow().length) return h.say(word('massive.no-more', { name }));
      void show();
    },
    word('massive.more'),
  );
  button(
    bar,
    word('massive.fewer'),
    'undo-2',
    () => {
      if (!x || !x.steps) return;
      x.shrink();
      void show();
    },
    word('massive.fewer'),
  );

  return {
    start(key, called, place) {
      x = new Expansion(h.drawing, key);
      name = called;
      anchor = place;
      bar.hidden = false;
    },
    state: () => (x ? { key: x.from, name, place: anchor, steps: x.steps } : null),
    restore(s) {
      x = s && new Expansion(h.drawing, s.key);
      // the rings grow the same way each time, so growing as many steps again gives the same picture
      for (let i = 0; x && s && i < s.steps; i++) x.grow();
      name = s?.name ?? '';
      anchor = s?.place ?? anchor;
      bar.hidden = !s;
    },
  };
}
