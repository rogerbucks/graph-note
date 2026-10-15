// Where an image is drawn (editor spec §18): in a thing's details, a figure — the image, its caption, its pause and play
// button and what it says — and on a box, the image in the room Graphviz kept for it (the core's `PICTURE_MARK` square),
// with its control drawn in the corner, an SVG button reached by Tab and pressed by Enter, Space, a click or a tap. Both
// are worked by animated-images.ts through the one `ImageView`; neither decides anything.
import { PICTURE_MARK } from '@graph-note/core';

const SVG = 'http://www.w3.org/2000/svg';

/** The side of the area a box's image control is hit in, in the drawing's own units, each at least a pixel: 24 or more. */
const HIT = 24;

/** How an image is shown: moving, its first frame held still, or as it is, never moving. */
export type Shown = 'moving' | 'still' | 'plain';

/** One image as it is drawn: what it shows, its control, and what it says. */
export interface ImageView {
  /** Shows the image at `url` (none: nothing could be drawn) as `how`, and marks it ready. */
  show(url: string | null, how: Shown): void;
  /** The control, made the first time: Pause while it moves, Play while it is still; `refused` when Play cannot move it. */
  control(playing: boolean, refused: boolean, press: () => void): void;
  /** What the image says: why it is still, or nothing. */
  say(words: string): void;
  /** Says why pressing Play did not move it. */
  refuse(why: string): void;
}

/** The class of each way an image is shown, so a style sheet and a screen reader's tests see which. */
const CLASSES: Record<Shown, string> = {
  moving: 'graph-note-image-moving',
  still: 'graph-note-image-still',
  plain: 'graph-note-image-plain',
};

const showAs = (el: Element, how: Shown) => {
  for (const [k, cls] of Object.entries(CLASSES)) el.classList.toggle(cls, k === how);
};

/** A figure in a thing's details for the image a property names: its caption is `property: value`. */
export function figureView(parent: HTMLElement, caption: string, name: string): ImageView {
  const fig = parent.createEl('figure', { cls: 'graph-note-image' });
  const img = fig.createEl('img', { attr: { alt: caption } });
  img.hidden = true;
  fig.createEl('figcaption', { text: caption });
  let button: HTMLButtonElement | null = null;
  const said = fig.createEl('p', { cls: 'graph-note-image-said', attr: { role: 'status' } });
  return {
    show(url, how) {
      img.hidden = !url;
      if (url) img.setAttribute('src', url);
      else img.removeAttribute('src');
      showAs(img, how);
      fig.setAttribute('data-ready', 'true');
    },
    control(playing, refused, press) {
      if (!button) {
        button = fig.createEl('button', { cls: 'graph-note-image-control', attr: { type: 'button' } });
        button.addEventListener('click', press);
        fig.insertBefore(button, said);
      }
      button.setText(playing ? 'Pause' : 'Play');
      button.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${name}`);
      if (refused) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    },
    say(words) {
      said.setText(words);
      said.removeAttribute('data-refused');
    },
    refuse(why) {
      said.setText(why);
      said.setAttribute('data-refused', 'true');
    },
  };
}

/** A figure for a property whose value names an image that is not shown, saying why. */
export function refusedFigure(parent: HTMLElement, caption: string, why: string): void {
  const fig = parent.createEl('figure', { cls: 'graph-note-image', attr: { 'data-ready': 'true' } });
  fig.createEl('figcaption', { text: caption });
  fig.createEl('p', { cls: 'graph-note-image-said', attr: { role: 'status' }, text: `Not shown: ${why}.` });
}

/** The marked square Graphviz drew for a picture in a box's group, if there is one. */
export const squareIn = (g: Element): Element | undefined =>
  Array.from(g.querySelectorAll('polygon')).find((p) => p.getAttribute('fill') === PICTURE_MARK);

/** The square's place in the drawing, from its points. */
function placeOf(square: Element): { x: number; y: number; width: number; height: number } {
  const xy = (square.getAttribute('points') ?? '')
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number));
  const xs = xy.map((p) => p[0] ?? 0),
    ys = xy.map((p) => p[1] ?? 0);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const svgEl = (parent: Element, tag: string, attrs: Record<string, string | number>): Element => {
  const e = parent.appendChild(activeDocument.createElementNS(SVG, tag));
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** The square of a picture that cannot be shown, drawn as a dashed frame saying why. */
export function refusedPicture(square: Element, why: string): void {
  const g = square.parentElement;
  if (!g) return;
  const frame = svgEl(g, 'rect', { class: 'graph-note-picture-missing', ...placeOf(square) });
  svgEl(frame, 'title', {}).textContent = `Not shown: ${why}.`;
  g.insertBefore(frame, square);
  square.remove();
}

/** The picture on a box, in place of its marked square, and its control in the square's corner, made when asked for. */
export function pictureView(square: Element, name: string): ImageView {
  const g = square.parentElement as Element;
  const at = placeOf(square);
  const image = svgEl(g, 'image', { class: 'graph-note-picture', ...at, preserveAspectRatio: 'xMidYMid meet' });
  g.insertBefore(image, square);
  square.remove();
  let control: Element | null = null,
    title: Element | null = null,
    glyph: Element | null = null;
  const size = Math.min(16, at.width / 2);
  return {
    show(url, how) {
      if (url) image.setAttribute('href', url);
      else image.removeAttribute('href');
      showAs(image, how);
    },
    control(playing, refused, press) {
      if (!control) {
        const c = svgEl(g, 'g', { class: 'graph-note-image-control', role: 'button', tabindex: 0 });
        title = svgEl(c, 'title', {});
        // the area a finger or pointer hits: at least 24 pixels square, centred on the button drawn smaller
        svgEl(c, 'rect', {
          class: 'graph-note-image-hit',
          x: at.x + at.width - size / 2 - HIT / 2,
          y: at.y + at.height - size / 2 - HIT / 2,
          width: HIT,
          height: HIT,
        });
        svgEl(c, 'rect', { x: at.x + at.width - size, y: at.y + at.height - size, width: size, height: size, rx: 3 });
        glyph = svgEl(c, 'text', {
          x: at.x + at.width - size / 2,
          y: at.y + at.height - size / 4,
          'text-anchor': 'middle',
        });
        c.addEventListener('click', press);
        c.addEventListener('keydown', (e: Event) => {
          const key = (e as KeyboardEvent).key;
          if (key !== 'Enter' && key !== ' ') return;
          e.preventDefault();
          press();
        });
        control = c;
      }
      control.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${name}`);
      if (refused) control.setAttribute('aria-disabled', 'true');
      else control.removeAttribute('aria-disabled');
      if (glyph) glyph.textContent = playing ? '❚❚' : '▶';
    },
    say(words) {
      if (title) title.textContent = words;
      control?.removeAttribute('data-refused');
    },
    refuse(why) {
      if (title) title.textContent = why;
      control?.setAttribute('data-refused', 'true');
    },
  };
}
