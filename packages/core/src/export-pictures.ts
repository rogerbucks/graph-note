// The pictures on boxes in an exported image (editor spec §16, export_animation_stated; §18; §11). Each is embedded in
// the file itself as a data address, so the image stays self-contained and loads nothing. An SVG keeps an animated
// image moving where its limits allow (image-limits.ts), with its first frame beside it. Under reduced motion the
// image's own style sheet, scoped under its class, shows that frame instead (motion_reduced_respected). A PNG cannot
// move, so each is reduced to its first frame, as is one past a limit. What was done with each animated image is said,
// a line each. It is said in UK English for the image's own frame, which is the file's bytes, and in the reader's
// language for the host's notice. A still image is embedded as it is, with nothing to say. The host loads the files
// (`PictureLoad`): the core never reads the vault.
import { inImage, withStyleSheet } from './export-motion.ts';
import type { ImageFacts } from './image-facts.ts';
import { IMAGE_LIMITS, pastLimit } from './image-limits.ts';
import type { Say } from './image-limits.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { Palette } from './palette.ts';
import { PICTURE_MARK } from './picture.ts';
import { sourceWord, word } from './words.ts';

/**
 * An image a host has loaded for an export. It has its file's name, type, bytes in base64 and size, what its bytes say,
 * and its first frame.
 */
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
 * The types an image is embedded as: the only words ever written into the file before its bytes. So a type a host gives
 * can never close the attribute and write markup of its own. An image is only ever embedded as an image element from a
 * data address, never put inline. An SVG attachment written into the file would run as part of it.
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
 * A drawn SVG (themed, before its frame) with each picture's square filled. The image loaded for it fills it, moving in
 * an SVG that may move (`moving`) when animated and within the limits. Else its first frame fills it. A dashed frame
 * fills it when none was loaded. It comes with what was done with each animated image, and why a picture was not drawn,
 * a line each. None when nothing was loaded at all (`loaded` empty). `said` is in UK English, for the file's bytes;
 * `told` is the same in the reader's language, for the host's notice.
 */
export function withPictures(
  svg: string,
  drawing: Pick<GraphDrawing, 'boxes' | 'pictures'>,
  loaded: readonly PictureLoaded[],
  moving: boolean,
  palette: Palette,
): { svg: string; said: string[]; told: string[] } {
  const said: string[] = [],
    told: string[] = [];
  /** Says one line both ways: in UK English for the file, and in the reader's language for the notice. */
  const line = (lineOf: (say: Say) => string) => {
    said.push(lineOf(sourceWord));
    told.push(lineOf(word));
  };
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
      if (image) line((say) => say('export.picture.not-drawn', { thing, why: image.why }));
    } else if ('unread' in image) {
      drawn = frame;
      const values = { thing, name: image.name, size: mb(image.size), most: mb(IMAGE_LIMITS.bytes) };
      line((say) => say('export.picture.too-large', values));
    } else if (!EMBEDDED.has(image.mime) || !BASE64.test(image.base64)) {
      drawn = frame;
      line((say) => say('export.picture.not-embedded', { thing, name: image.name }));
    } else if (image.facts && image.facts.format !== null && !image.facts.animated) {
      drawn = imageAt('thoughtknot-picture', at, image.mime, image.base64);
    } else {
      const first = image.still !== undefined && BASE64.test(image.still) ? image.still : undefined;
      const moves = moving && !pastLimit(image) && moved < IMAGE_LIMITS.moving;
      /** Why the image does not move, said by `say`. */
      const why = (say: Say): string =>
        !moving
          ? say('export.picture.png')
          : (pastLimit(image, say) ?? say('export.picture.moving-already', { moving: String(IMAGE_LIMITS.moving) }));
      const named = { thing, name: image.name };
      const still = first ? imageAt('thoughtknot-picture-still', at, 'image/png', first) : '';
      if (moves) {
        moved++;
        drawn = imageAt('thoughtknot-picture-moving', at, image.mime, image.base64) + still;
        line((say) => say(still ? 'export.picture.moving' : 'export.picture.moving-always', named));
      } else if (first || !moving) {
        // a PNG is drawn from the file as an image, which shows an animated one's first frame
        drawn = first
          ? imageAt('thoughtknot-picture', at, 'image/png', first)
          : imageAt('thoughtknot-picture', at, image.mime, image.base64);
        line((say) => say('export.picture.first-frame', { ...named, why: why(say) }));
      } else {
        drawn = frame;
        line((say) => say('export.picture.left-out', { ...named, why: why(say) }));
      }
    }
    out = out.replace(group[0], () => `${group[1]}${(group[2] ?? '').replace(square[0], () => drawn)}${group[3]}`);
  });
  return { svg: out, said, told };
}

/** The framed image with its pictures' first frames shown in place of their movement under reduced motion, when any moves. */
export const withStillPictures = (svg: string): string =>
  svg.includes('thoughtknot-picture-moving') ? withStyleSheet(svg, STILL_CSS) : svg;

/**
 * What an export did with its animated images, as one line for the host's notice, in the reader's language. With
 * `sourceWord` as `say`, it is the line for the image's frame, in UK English.
 */
export const animationSaid = (said: readonly string[], say: Say = word): string =>
  say('export.animated-images', { said: said.join('; ') });
