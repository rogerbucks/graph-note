// The pictures on boxes in an exported image (editor spec §16, export_animation_stated; §18; §11): each embedded in the
// file itself as a data address, so the image stays self-contained and loads nothing. An SVG keeps an animated image
// moving where its limits allow (image-limits.ts), with its first frame beside it, which the image's own style sheet,
// scoped under its class, shows instead under reduced motion (motion_reduced_respected); a PNG cannot move, so each is
// reduced to its first frame, as is one past a limit; and what was done with each animated image is said, a line each,
// for the host's notice and the image's own frame. A still image is embedded as it is, with nothing to say. The host
// loads the files (`PictureLoad`): the core never reads the vault.
import { inImage, withStyleSheet } from './export-motion.ts';
import type { ImageFacts } from './image-facts.ts';
import { IMAGE_LIMITS, pastLimit } from './image-limits.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { Palette } from './palette.ts';
import { PICTURE_MARK } from './picture.ts';

/** An image a host has loaded for an export: its file's name, type, bytes in base64 and size, what its bytes say, and its first frame. */
export interface LoadedImage {
  name: string;
  mime: string;
  base64: string;
  size: number;
  facts: ImageFacts | null;
  /** Its first frame as a PNG, in base64, when the host could draw one. */
  still?: string;
}

/** An image a host found but never read, being over the size limit (`IMAGE_LIMITS.bytes`): its name and size alone. */
export interface UnreadImage {
  name: string;
  size: number;
  unread: true;
}

/** The host's loader: the image a picture's value names, found but not read when too large, or why it cannot be had. */
export type PictureLoad = (value: string) => Promise<LoadedImage | UnreadImage | { why: string }>;

/** What an export does with a picture: the image the host loaded for it, or why none was; none when nothing was loaded. */
export type PictureLoaded = LoadedImage | UnreadImage | { why: string } | undefined;

/**
 * The types an image is embedded as: the only words ever written into the file before its bytes, so a type a host
 * gives can never close the attribute and write markup of its own. An image is only ever embedded as an image element
 * from a data address, never put inline: an SVG attachment written into the file would run as part of it.
 */
const EMBEDDED = new Set([
  'image/gif',
  'image/png',
  'image/apng',
  'image/webp',
  'image/svg+xml',
  'image/jpeg',
  'image/avif',
]);

/** Base64, as written: its letters, digits, `+`, `/` and padding, nothing that could close an attribute. */
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** A megabyte count, as the limits are said: one decimal place where it has one. */
const mb = (bytes: number): string => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/** The style sheet that shows an image's first frame in place of its movement under reduced motion. */
const STILL_CSS = [
  `${inImage('.thoughtknot-picture-still')} { display: none; }`,
  `@media (prefers-reduced-motion: reduce) { ${inImage('.thoughtknot-picture-moving')} { display: none; } ` +
    `${inImage('.thoughtknot-picture-still')} { display: inline; } }`,
].join('\n');

/** The square Graphviz drew for a picture inside a box's group, and the box it is in, by Graphviz's numbering. */
const SQUARE = new RegExp(`<polygon fill="${PICTURE_MARK}"[^>]*points="([^"]*)"[^>]*/>`);

/** The square's place, from its points. */
function placeOf(points: string): { x: number; y: number; width: number; height: number } {
  const xy = points
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number));
  const xs = xy.map((p) => p[0] ?? 0),
    ys = xy.map((p) => p[1] ?? 0);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** An image element at a place, of a class, showing a data address. */
const imageAt = (cls: string, at: ReturnType<typeof placeOf>, mime: string, base64: string): string =>
  `<image class="${cls}" x="${at.x}" y="${at.y}" width="${at.width}" height="${at.height}" ` +
  `preserveAspectRatio="xMidYMid meet" href="data:${mime};base64,${base64}"/>`;

/**
 * A drawn SVG (themed, before its frame) with each picture's square filled: by the image loaded for it, moving in an SVG
 * that may move (`moving`) when animated and within the limits, else its first frame; by a dashed frame when none was.
 * With what was done with each animated image, and why a picture was not drawn, a line each: none when nothing was
 * loaded at all (`loaded` empty).
 */
export function withPictures(
  svg: string,
  drawing: Pick<GraphDrawing, 'boxes' | 'pictures'>,
  loaded: readonly PictureLoaded[],
  moving: boolean,
  palette: Palette,
): { svg: string; said: string[] } {
  const said: string[] = [];
  let moved = 0,
    out = svg;
  (drawing.pictures ?? []).forEach((p, i) => {
    const group = new RegExp(`(<g id="node${p.index + 1}"[^>]*>)([\\s\\S]*?)(</g>)`).exec(out);
    const square = group ? SQUARE.exec(group[2] ?? '') : null;
    if (!group || !square) return;
    const at = placeOf(square[1] ?? ''),
      thing = drawing.boxes[p.index]?.text ?? p.key,
      image = loaded[i];
    const frame =
      `<rect class="thoughtknot-picture-missing" x="${at.x}" y="${at.y}" width="${at.width}" height="${at.height}" ` +
      `fill="none" stroke="${palette.muted}" stroke-dasharray="3 3"/>`;
    let drawn: string;
    if (!image || 'why' in image) {
      drawn = frame;
      if (image) said.push(`${thing}: not drawn, as ${image.why}`);
    } else if ('unread' in image) {
      drawn = frame;
      said.push(`${thing}: ${image.name} left out, as it is ${mb(image.size)}, over ${mb(IMAGE_LIMITS.bytes)}`);
    } else if (!EMBEDDED.has(image.mime) || !BASE64.test(image.base64)) {
      drawn = frame;
      said.push(`${thing}: not drawn, as ${image.name} is not of an image type an export embeds`);
    } else if (image.facts && image.facts.format !== null && !image.facts.animated) {
      drawn = imageAt('thoughtknot-picture', at, image.mime, image.base64);
    } else {
      const first = image.still !== undefined && BASE64.test(image.still) ? image.still : undefined;
      const past = pastLimit(image),
        why = !moving
          ? 'a PNG cannot move'
          : past
            ? past
            : moved >= IMAGE_LIMITS.moving
              ? `${IMAGE_LIMITS.moving} animated images already move in it`
              : null;
      const still = first ? imageAt('thoughtknot-picture-still', at, 'image/png', first) : '';
      if (why === null) {
        moved++;
        drawn = imageAt('thoughtknot-picture-moving', at, image.mime, image.base64) + still;
        said.push(
          `${thing}: ${image.name} kept moving${still ? ', and still under reduced motion' : ', and moving under reduced motion too, as its first frame could not be made'}`,
        );
      } else if (first || !moving) {
        // a PNG is drawn from the file as an image, which shows an animated one's first frame
        drawn = first
          ? imageAt('thoughtknot-picture', at, 'image/png', first)
          : imageAt('thoughtknot-picture', at, image.mime, image.base64);
        said.push(`${thing}: ${image.name} reduced to its first frame, as ${why}`);
      } else {
        drawn = frame;
        said.push(`${thing}: ${image.name} left out, as ${why} and its first frame could not be made`);
      }
    }
    out = out.replace(group[0], () => `${group[1]}${(group[2] ?? '').replace(square[0], () => drawn)}${group[3]}`);
  });
  return { svg: out, said };
}

/** The framed image with its pictures' first frames shown in place of their movement under reduced motion, when any moves. */
export const withStillPictures = (svg: string): string =>
  svg.includes('thoughtknot-picture-moving') ? withStyleSheet(svg, STILL_CSS) : svg;

/** What an export did with its animated images, as one line for the image's frame and the host's notice. */
export const animationSaid = (said: readonly string[]): string => `Animated images: ${said.join('; ')}.`;
