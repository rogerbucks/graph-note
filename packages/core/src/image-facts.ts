// What an image's own bytes say of it (editor spec §18, animated_image_shown, animated_image_limited): its format, whether
// it moves, how many frames it has and how large each is, read from the header and chunks each format writes — a GIF's
// image descriptors, an APNG's animation control chunk, an animated WebP's flag and frames, an AVIF sequence's brand, an
// SVG's animate elements or CSS keyframes. Nothing is decoded and no library is used: the host's own image decoding draws it (no new dependency).
// Every read is held to the bytes there, so a file cut short or written wrongly is read as far as it goes.

/** The formats an image's bytes are known as: a PNG that moves is an APNG, and is still `png` here. */
export type ImageFormat = 'gif' | 'png' | 'webp' | 'svg' | 'jpeg' | 'avif';

/** What an image's bytes say: its format (null when no format is known), whether it moves, its frames and its size. */
export interface ImageFacts {
  format: ImageFormat | null;
  animated: boolean;
  /** How many frames it has: 1 when still; 0 for an animated SVG, whose movement has no frames to count. */
  frames: number;
  /** Its size in pixels, as its header says; 0 when it does not say. */
  width: number;
  height: number;
}

const NONE: ImageFacts = { format: null, animated: false, frames: 0, width: 0, height: 0 };

const starts = (b: Uint8Array, at: number, s: string): boolean =>
  b.length >= at + s.length && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const le16 = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const le24 = (b: Uint8Array, at: number) => le16(b, at) | ((b[at + 2] ?? 0) << 16);
const le32 = (b: Uint8Array, at: number) => (le24(b, at) | ((b[at + 3] ?? 0) << 24)) >>> 0;
const be32 = (b: Uint8Array, at: number) =>
  (((b[at] ?? 0) << 24) | ((b[at + 1] ?? 0) << 16) | ((b[at + 2] ?? 0) << 8) | (b[at + 3] ?? 0)) >>> 0;

/** Past a run of GIF data sub-blocks, each a length then that many bytes, to the byte after their terminator. */
function pastSubBlocks(b: Uint8Array, at: number): number {
  while (at < b.length && b[at] !== 0) at += (b[at] ?? 0) + 1;
  return at + 1;
}

/** A GIF: its logical screen's size, and a frame for each image descriptor before the trailer or the end. */
function gifFacts(b: Uint8Array): ImageFacts {
  const width = le16(b, 6),
    height = le16(b, 8),
    packed = b[10] ?? 0;
  let at = 13 + (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0),
    frames = 0;
  while (at < b.length) {
    const block = b[at];
    if (block === 0x3b) break;
    if (block === 0x21) at = pastSubBlocks(b, at + 2);
    else if (block === 0x2c) {
      const local = b[at + 9] ?? 0;
      at += 10 + (local & 0x80 ? 3 * 2 ** ((local & 7) + 1) : 0) + 1;
      if (at > b.length) break;
      at = pastSubBlocks(b, at);
      if (at > b.length) break;
      frames++;
    } else break;
  }
  return { format: 'gif', animated: frames > 1, frames: Math.max(frames, 1), width, height };
}

/** A PNG: its header's size, and an APNG's frame count from the animation control chunk, if one comes before the data. */
function pngFacts(b: Uint8Array): ImageFacts {
  const width = be32(b, 16),
    height = be32(b, 20);
  for (let at = 8; at + 8 <= b.length;) {
    const length = be32(b, at);
    if (starts(b, at + 4, 'IDAT')) break;
    if (starts(b, at + 4, 'acTL')) {
      const frames = be32(b, at + 8);
      return { format: 'png', animated: frames > 1, frames: Math.max(frames, 1), width, height };
    }
    at += 12 + length;
  }
  return { format: 'png', animated: false, frames: 1, width, height };
}

/** A WebP: an extended one's canvas and animation flag, counting its frames; a simple lossy or lossless one is still. */
function webpFacts(b: Uint8Array): ImageFacts {
  if (starts(b, 12, 'VP8X')) {
    const animated = ((b[20] ?? 0) & 0x02) !== 0,
      width = le24(b, 24) + 1,
      height = le24(b, 27) + 1;
    let frames = 0;
    for (let at = 12; at + 8 <= b.length;) {
      if (starts(b, at, 'ANMF')) frames++;
      const size = le32(b, at + 4);
      at += 8 + size + (size % 2);
    }
    return { format: 'webp', animated: animated && frames > 1, frames: Math.max(frames, 1), width, height };
  }
  if (starts(b, 12, 'VP8L')) {
    const bits = le32(b, 21);
    return {
      format: 'webp',
      animated: false,
      frames: 1,
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (starts(b, 12, 'VP8 '))
    return { format: 'webp', animated: false, frames: 1, width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
  return { format: 'webp', animated: false, frames: 1, width: 0, height: 0 };
}

/** A number of pixels an SVG's root gives as its width or height, plainly or in px; 0 for any other unit or none. */
const svgSize = (root: string, name: string): number => {
  const m = new RegExp(`\\s${name}="\\s*([\\d.]+)(?:px)?\\s*"`).exec(root);
  return m ? Math.round(parseFloat(m[1] ?? '0')) : 0;
};

/** Where an SVG's markup starts and its root element, and how many characters were looked at to find them. */
export interface SvgScan {
  /** Where its `<svg` root starts; null when the text is no SVG. */
  start: number | null;
  /** The root's start tag, up to its `>`; empty when it has none. */
  root: string;
  looked: number;
}

const SPACE = /\s/;
/** A UTF-8 byte order mark, read a byte to a character. */
const BOM = 'ï»¿';

/**
 * Where an SVG starts: past a byte order mark, white space, an XML declaration, comments and a doctype, in any order,
 * each found by searching on from where the last ended, so every character is looked at once and a comment ends at its
 * first `-->` (review of #443: a pattern that went back over itself took seconds on 200 bytes); then its root's start
 * tag, to its first `>`. No pattern runs over the text but those that look at each character once.
 */
export function svgScan(text: string): SvgScan {
  let at = text.startsWith(BOM) ? BOM.length : 0,
    looked = at;
  const skipTo = (end: string, from: number): boolean => {
    const found = text.indexOf(end, from);
    looked += (found < 0 ? text.length : found + end.length) - at;
    if (found < 0) return false;
    at = found + end.length;
    return true;
  };
  for (;;) {
    while (at < text.length && SPACE.test(text.charAt(at))) {
      at++;
      looked++;
    }
    if (text.startsWith('<?', at)) {
      if (!skipTo('?>', at + 2)) return { start: null, root: '', looked };
    } else if (text.startsWith('<!--', at)) {
      if (!skipTo('-->', at + 4)) return { start: null, root: '', looked };
    } else if (text.slice(at, at + 9).toUpperCase() === '<!DOCTYPE') {
      if (!skipTo('>', at + 9)) return { start: null, root: '', looked };
    } else break;
  }
  const start = at;
  if (text.slice(at, at + 4).toLowerCase() !== '<svg' || /[A-Za-z0-9:_.-]/.test(text.charAt(at + 4)))
    return { start: null, root: '', looked };
  const end = text.indexOf('>', at);
  looked += (end < 0 ? text.length : end + 1) - at;
  return { start, root: end < 0 ? '' : text.slice(at, end + 1), looked };
}

/** An SVG: its root's size, and whether an animate element or a CSS animation moves anything in it. */
function svgFacts(text: string, root: string): ImageFacts {
  const animated = /<(?:animate|animateMotion|animateTransform|set)\b|@keyframes\b/i.test(text);
  return {
    format: 'svg',
    animated,
    frames: animated ? 0 : 1,
    width: svgSize(root, 'width'),
    height: svgSize(root, 'height'),
  };
}

/**
 * An AVIF, by the major brand of its file type box: `avis`, an image sequence, moves; `avif` is still. Its size is not
 * read, so only its size on disk holds it to the limits.
 */
function avifFacts(b: Uint8Array): ImageFacts | null {
  if (!starts(b, 4, 'ftyp')) return null;
  if (starts(b, 8, 'avis')) return { format: 'avif', animated: true, frames: 0, width: 0, height: 0 };
  if (starts(b, 8, 'avif')) return { format: 'avif', animated: false, frames: 1, width: 0, height: 0 };
  return null;
}

/**
 * What the bytes of an image say of it: its format, whether it moves, how many frames it has and its size. Known by the
 * bytes alone, never the file's name; bytes no format writes are no image (`format` null).
 */
export function imageFacts(bytes: Uint8Array): ImageFacts {
  const b = bytes;
  if (starts(b, 0, 'GIF87a') || starts(b, 0, 'GIF89a')) return gifFacts(b);
  if (b[0] === 0x89 && starts(b, 1, 'PNG\r\n\u001a\n')) return pngFacts(b);
  if (starts(b, 0, 'RIFF') && starts(b, 8, 'WEBP')) return webpFacts(b);
  if (b[0] === 0xff && b[1] === 0xd8) return { format: 'jpeg', animated: false, frames: 1, width: 0, height: 0 };
  const avif = avifFacts(b);
  if (avif) return avif;
  // markup starts with `<` after any white space: anything else is not read whole as text
  const head = text(b.subarray(0, 1024));
  if (!(head.startsWith(BOM) ? head.slice(BOM.length) : head).trimStart().startsWith('<')) return NONE;
  const all = text(b),
    scan = svgScan(all);
  return scan.start === null ? NONE : svgFacts(all, scan.root);
}

/**
 * Bytes read as text a byte to a character: an SVG's markup, which is all it is looked at for, is ASCII whatever the file's
 * encoding, so no decoder is needed (the core runs where there is none). Read in runs, so a large file never overflows
 * the call's arguments.
 */
function text(b: Uint8Array): string {
  let out = '';
  for (let at = 0; at < b.length; at += 8192) out += String.fromCharCode(...b.subarray(at, at + 8192));
  return out;
}
