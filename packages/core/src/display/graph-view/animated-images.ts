// Animated images on a card (editor spec §18, §11): a thing's image — a GIF, APNG, animated WebP or animated SVG
// attached in the vault — shown in its details and, where its style asks (a Picture), on its box (animated_image_shown);
// each with a pause and play control, reached from the keyboard and by touch (animation_pause_play); still, its first
// frame, under reduced motion until the user plays it (motion_reduced_respected); and past the core's stated limits of
// size and count, its first frame, saying why, Play refused with the reason (animated_image_limited). The core decides
// how each starts and whether it may play (`startOf`, `playRefusal`); the browser's own decoding draws it, from the
// file's bytes read through the vault, and the first frame is drawn by the plugin (`stillFrame`). A file over the size
// limit is never read: by its size on disk alone it is not shown, saying why, or, a photograph, shown from the vault's
// own address. An image is only ever shown by an image element, never put inline: an SVG attachment put in the page
// would run as part of it. Each card counts what moves on it, its details among it, and lets every image go with it.
import { IMAGE_LIMITS, LIMITS_SAID, imageFacts, imagesOf, neverMoves, playRefusal, startOf } from '@thoughtknot/core';
import type { ImageFacts, PictureBox, Start } from '@thoughtknot/core';
import type { FoundImage, ImageSource } from '../images/image-source';
import { STILL_PIXELS } from '../images/still-frame';
import { figureView, pictureView, refusedFigure, refusedPicture, squareIn } from './image-views';
import type { ImageView } from './image-views';

/** What a card's images need: the vault's images from its note, a way to draw a first frame, and the boxes with a picture. */
export interface CardImages {
  source: ImageSource;
  /** The PNG of an image's first frame, or null where it cannot be drawn. */
  still(bytes: Uint8Array, mime: string): Promise<Uint8Array | null>;
  pictures: readonly PictureBox[];
}

/** What a paused image says. */
const PAUSED = 'Paused. Press Play to move it.';

/** Whether an event came from an image's control, which a tap or a key on is never one on the drawing. */
export const onImageControl = (target: EventTarget | null): boolean =>
  !!(target as Element | null)?.closest?.('.thoughtknot-image-control');

/** The animated images of one card: how many move now, and every image, by where it is shown, to let go. */
export class MovingImages {
  moving = 0;
  private readonly shown = new Map<string, Set<AnimatedImage>>();

  /** For a card whose system does, or does not, ask for reduced motion; with the card's images, if it has any. */
  constructor(
    readonly reduced: boolean,
    readonly images: CardImages | undefined,
  ) {}

  /** Keeps `image` among those shown at `where` (the boxes, or the details). */
  add(where: string, image: AnimatedImage): void {
    const set = this.shown.get(where) ?? new Set();
    set.add(image);
    this.shown.set(where, set);
  }

  /** Lets go every image shown at `where`, or, with none, every image on the card. */
  release(where?: string): void {
    for (const [w, set] of this.shown)
      if (where === undefined || w === where) {
        set.forEach((i) => i.release());
        this.shown.delete(w);
      }
  }
}

const urlOf = (bytes: Uint8Array, mime: string): string =>
  URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }));

/** One image on a card: read, started as the core says, paused and played, and let go with what it holds. */
export class AnimatedImage {
  private start: Start | null = null;
  private playing = false;
  private gone = false;
  private bytes: Uint8Array | null = null;
  private facts: ImageFacts | null = null;
  private moving: string | null = null;
  private still: string | null | undefined;

  constructor(
    private readonly view: ImageView,
    private readonly found: FoundImage,
    private readonly card: MovingImages,
  ) {}

  /** Whether the file is over the size limit, so never read (review of #443): its size on disk says so, before any read. */
  private get unread(): boolean {
    return this.found.size > IMAGE_LIMITS.bytes;
  }

  /** Reads the file's bytes through the vault, unless it is over the size limit; false, saying why, when it cannot. */
  async read(): Promise<boolean> {
    if (this.unread) return true;
    try {
      this.bytes = await this.found.read();
      return true;
    } catch (e) {
      this.view.say(`${this.found.name} could not be read: ${(e as Error).message}`);
      this.view.show(null, 'still');
      return false;
    }
  }

  /** Starts it as the core says, against what moves on the card now: at once, so images started in turn are counted in turn. */
  begin(): void {
    if (this.gone || (!this.bytes && !this.unread)) return;
    const size = this.found.size;
    this.facts = this.bytes ? imageFacts(this.bytes) : null;
    const start = startOf({
      facts: this.facts,
      size,
      neverMoves: neverMoves(this.found.name),
      reduced: this.card.reduced,
      moving: this.card.moving,
    });
    this.start = start;
    // a photograph too large to read is shown from the vault's own address, never read here
    if (!start.moving && start.plain) this.view.show(this.bytes ? this.movingUrl() : this.found.url, 'plain');
    else if (start.moving) this.play();
    else void this.hold(start.playable ? start.why : `${start.why} ${LIMITS_SAID}`, !start.playable);
  }

  /** Pause or Play, as pressed: Play refused, saying why, past a limit or while as many as may move already do. */
  press(): void {
    const start = this.start;
    if (!start || this.gone) return;
    if (this.playing) {
      this.card.moving--;
      this.playing = false;
      void this.hold(PAUSED, false);
      return;
    }
    const refused = playRefusal(start, this.card.moving);
    if (refused) this.view.refuse(refused);
    else this.play();
  }

  /** Lets go of the image: what it counted as moving, and its addresses. */
  release(): void {
    if (this.gone) return;
    this.gone = true;
    if (this.playing) this.card.moving--;
    this.playing = false;
    for (const url of [this.moving, this.still]) if (url) URL.revokeObjectURL(url);
  }

  private movingUrl(): string {
    this.moving ??= urlOf(this.bytes ?? new Uint8Array(0), this.found.mime);
    return this.moving;
  }

  private play(): void {
    this.playing = true;
    this.card.moving++;
    this.view.control(true, false, () => this.press());
    this.view.say('');
    this.view.show(this.movingUrl(), 'moving');
  }

  /**
   * Held still, its first frame, saying why; `refused` when Play cannot move it. One never read has no first frame to
   * draw, and one whose frame is over `STILL_PIXELS` is never drawn: each shows nothing, saying why.
   */
  private async hold(why: string, refused: boolean): Promise<void> {
    this.view.control(false, refused, () => this.press());
    this.view.say(why);
    if (!this.bytes) {
      this.view.show(null, 'still');
      return;
    }
    const facts = this.facts,
      drawable = !facts || facts.width * facts.height <= STILL_PIXELS;
    if (this.still === undefined) {
      const png = drawable ? await this.card.images?.still(this.bytes, this.found.mime) : null;
      if (this.gone) return;
      this.still ??= png ? urlOf(png, 'image/png') : null;
    }
    if (this.playing || this.gone) return;
    this.view.show(this.still, 'still');
    if (!this.still) this.view.say(`${why} Its first frame cannot be drawn on this device.`);
  }
}

/** Reads every image found, then starts each in turn, so the first ones in order are the ones that move. */
async function startAll(card: MovingImages, where: string, made: [ImageView, FoundImage][]): Promise<void> {
  const images = made.map(([view, found]) => new AnimatedImage(view, found, card));
  images.forEach((i) => card.add(where, i));
  const read = await Promise.all(images.map((i) => i.read()));
  images.forEach((i, n) => {
    if (read[n]) i.begin();
  });
}

/**
 * The pictures on the boxes of `svg` (§18): each box a Picture draws on gets its image in the square kept for it, with
 * its control; a value that names no image in the vault, a dashed frame saying why.
 */
export function placePictures(svg: Element, card: MovingImages): void {
  const images = card.images;
  if (!images?.pictures.length) return;
  const made: [ImageView, FoundImage][] = [];
  for (const p of images.pictures) {
    const g = Array.from(svg.querySelectorAll('g.node')).find((x) => x.getAttribute('data-key') === p.key);
    const square = g && squareIn(g);
    if (!square) continue;
    const found = images.source.find(p.value);
    if (!found || 'why' in found) refusedPicture(square, found ? found.why : `${p.value} names no image`);
    else made.push([pictureView(square, found.name), found]);
  }
  void startAll(card, 'boxes', made);
}

/**
 * The images a thing's properties name, in its details (§18): a heading, then a figure for each, in the order of the
 * properties' names; those shown before in the details let go first. Nothing when it names none.
 */
export function renderImages(el: HTMLElement, props: Record<string, unknown>, card: MovingImages): void {
  card.release('details');
  const images = card.images,
    named = imagesOf(props);
  if (!images || !named.length) return;
  el.createEl('h4', { text: 'Images' });
  const list = el.createDiv({ cls: 'thoughtknot-images' });
  const made: [ImageView, FoundImage][] = [];
  for (const n of named) {
    const caption = `${n.property}: ${n.value}`;
    const found = images.source.find(n.value);
    if (!found || 'why' in found) refusedFigure(list, caption, found ? found.why : `${n.value} names no image`);
    else made.push([figureView(list, `${n.property}: ${found.name}`, found.name), found]);
  }
  void startAll(card, 'details', made);
}
