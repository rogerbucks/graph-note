// Where a thing's image comes from (editor spec §18, animated_image_shown). It is a property whose value names an image
// file attached in the vault. The value is a link, `[[cat.gif]]`, an embed, `![[cat.gif]]`, or a path from the vault's
// root. The file is of a type an image is: GIF, PNG or APNG, WebP, SVG, and the photographs' JPEG and AVIF. Only the
// vault's own files are loaded (§13, remote_images_asked, a later slice). An address outside it is never loaded and
// says so. A place that could leave the vault or reach what it hides is refused, as a graph source's is (sources.ts).
import { outsideVault } from './sources.ts';

/** The file types an image is known by, by extension, in any case. */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'gif',
  'png',
  'apng',
  'webp',
  'svg',
  'jpg',
  'jpeg',
  'avif',
]);

/**
 * Whether a file's type, by its name, never moves: a JPEG. Used only for an image not read, being over the size limit,
 * whose bytes cannot say. Every other image type may move (a PNG may be an APNG, an AVIF a sequence).
 */
export const neverMoves = (name: string): boolean => /\.jpe?g$/i.test(name);

/** An image a value names: the vault's file to load by its link, or why it is not loaded. */
export type ImageLink = { link: string } | { refused: string };

/** A property of a thing that names an image: its name, its value as written, and the image. */
export interface NamedImage {
  property: string;
  value: string;
  image: ImageLink;
}

const LINK = /^!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/;
const SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const isImage = (place: string): boolean => IMAGE_EXTENSIONS.has(/\.([^./\\]+)$/.exec(place)?.[1]?.toLowerCase() ?? '');

/**
 * The image a property's value names, or null when it names none. It names none when the value is not text, or names a
 * note or any file that is not an image. An address with a scheme (`https:`, `data:`) or starting `//` is outside the
 * vault. It is never loaded. A place with a leading slash, a drive, a `..` part or a part starting with a dot is
 * refused. A link's target is held to the same as a path is (review of #443): `[[../x.gif]]` leaves the vault as
 * `../x.gif` does.
 */
export function imageLink(value: unknown): ImageLink | null {
  if (typeof value !== 'string') return null;
  const written = value.trim(),
    place = LINK.exec(written)?.[1]?.trim() ?? written;
  if (SCHEME.test(place) && !/^[A-Za-z]:[/\\]/.test(place))
    return isImage(place.replace(/[?#].*$/, '')) || /^data:image\//i.test(place)
      ? { refused: `${written} is outside the vault, and an image from outside the vault is not loaded` }
      : null;
  if (!isImage(place)) return null;
  if (outsideVault(place) || place.split(/[/\\]/).includes('..'))
    return {
      refused: `${written} is not a place inside the vault: write its path from the vault’s root, or link it as [[name]]`,
    };
  return { link: place };
}

/** The images a thing's properties name, in the order of the properties' names, as its details list them. */
export function imagesOf(props: Record<string, unknown>): NamedImage[] {
  return Object.keys(props)
    .sort()
    .flatMap((property) => {
      const value = props[property],
        image = imageLink(value);
      return image && typeof value === 'string' ? [{ property, value, image }] : [];
    });
}
