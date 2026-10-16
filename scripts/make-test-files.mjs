#!/usr/bin/env node
// Makes every file the tests and the device checks need, so none is supplied by hand (editor spec §12, tests_self_contained,
// test_files_generated): the animated GIF, APNG, WebP and SVG images, a still PNG, a PDF, and a GIF over the size limit, in
// the folders of the device-check notes that name them. The pictures are synthetic: a small square moving across a plain
// ground, in colours chosen by a number, nothing taken from anywhere. Run it again at any time; a file is written only
// when its bytes differ, so Obsidian Sync sees no change.
//
// Usage:
//   node scripts/make-test-files.mjs              make the files in test-vault/ of this repository
//   node scripts/make-test-files.mjs --root DIR   the same, in the repository at DIR
//   node scripts/make-test-files.mjs --no-large   leave out the GIF over the size limit
//
// The small files are committed, and test/test-files.test.js holds them to what this makes; the large one (big.gif, over
// 5 MB) is ignored by git and made here, by scripts/reset-test-vault.mjs, when a check is set up.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUBE, gif, pdf, png, svg, webp } from './test-images.mjs';

const ANIMATED = '20 Animated images';
const LINKS = '21 Links and attachments';
const NOTES = 'Device checks';

/** A picture of `frames` frames, `size` by `size`, in colours chosen by `seed`; `animated` is whether it moves. */
const picture = (folder, name, format, frames, seed, [width, height] = [32, 32]) => ({
  folder,
  name,
  format,
  frames,
  seed,
  width,
  height,
  animated: frames > 1,
  scene: 'square',
});

/** Every file made, with what it is meant to be: its folder, name, format, frames, size and whether it moves. */
export const TEST_FILES = [
  picture(ANIMATED, 'cat.gif', 'gif', 4, 0),
  picture(ANIMATED, 'spin.png', 'png', 3, 1),
  picture(ANIMATED, 'dance.webp', 'webp', 3, 2),
  { folder: ANIMATED, name: 'loop.svg', format: 'svg', frames: 0, animated: true, width: 64, height: 64, seed: 3 },
  picture(ANIMATED, 'kit.png', 'png', 1, 3),
  picture(ANIMATED, 'tom.gif', 'gif', 4, 4),
  picture(ANIMATED, 'kit.gif', 'gif', 4, 5),
  picture(ANIMATED, 'rex.gif', 'gif', 4, 6),
  picture(ANIMATED, 'small.gif', 'gif', 4, 7),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => picture(ANIMATED, `c${n}.gif`, 'gif', 3, n)),
  // over the 5 MB an animated image may be: noise does not compress, so five frames of a million pixels pass it
  { ...picture(ANIMATED, 'big.gif', 'gif', 5, 99, [1000, 1000]), scene: 'noise', large: true },
  picture(LINKS, 'photo.png', 'png', 1, 3, [64, 48]),
  { folder: LINKS, name: 'report.pdf', format: 'pdf', frames: 1, animated: false, width: 0, height: 0, seed: 0 },
];

/** The palette indices of frame `i` of a GIF's picture: a square moving across a ground, or noise for the large one. */
function indices(entry, i) {
  const { width, height, frames, seed } = entry;
  const out = new Uint8Array(width * height);
  if (entry.scene === 'noise') {
    let state = (Math.imul(seed, 7919) + Math.imul(i, 104729) + 1) >>> 0;
    for (let p = 0; p < out.length; p++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      out[p] = state >>> 24;
    }
    return out;
  }
  const ground = seed % 8,
    square = (ground + 5) % 8,
    size = width >> 2,
    left = i * Math.floor((width - size) / Math.max(frames, 1)),
    top = (height - size) >> 1;
  out.fill(ground);
  for (let y = top; y < top + size; y++) out.fill(square, y * width + left, y * width + left + size);
  return out;
}

/**
 * Frame `i` of a picture as the format holds it: a GIF's list of palette indices, or the RGBA bytes of a PNG or a WebP.
 * The tests read the files back and compare them with this.
 */
export function pixelsOf(entry, i) {
  const ix = indices(entry, i);
  if (entry.format === 'gif') return ix;
  const rgba = new Uint8Array(ix.length * 4);
  ix.forEach((c, p) => rgba.set([...CUBE[c], 255], p * 4));
  return rgba;
}

/** The palette of a GIF: the eight colours of the small pictures, or 256 greys for the noise. */
const paletteOf = (entry) => (entry.scene === 'noise' ? Array.from({ length: 256 }, (_, g) => [g, g, g]) : CUBE);

/** The bytes of one file. */
export function bytesOf(entry) {
  const { width, height } = entry;
  const frames = Array.from({ length: Math.max(entry.frames, 1) }, (_, i) => i);
  switch (entry.format) {
    case 'gif':
      return gif({ width, height, palette: paletteOf(entry), frames: frames.map((i) => pixelsOf(entry, i)) });
    case 'png':
      return png({ width, height, frames: frames.map((i) => pixelsOf(entry, i)) });
    case 'webp':
      return webp({ width, height, frames: frames.map((i) => pixelsOf(entry, i)) });
    case 'svg':
      return svg({ size: width });
    case 'pdf':
      return pdf('Report');
    default:
      throw new Error(`no encoder for ${entry.format}`);
  }
}

/** Writes a file only when its bytes differ, so a synced vault sees no change. */
function write(path, bytes) {
  try {
    if (Buffer.from(bytes).equals(readFileSync(path))) return;
  } catch {
    // not there yet
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

/** Makes the files in the vault at `vault` (its `Device checks` folder); returns the paths of everything it made or kept. */
export function makeTestFiles(vault, { large = true } = {}) {
  return TEST_FILES.filter((e) => large || !e.large).map((e) => {
    const path = join(vault, NOTES, e.folder, e.name);
    write(path, bytesOf(e));
    return path;
  });
}

function main(args) {
  let root = join(dirname(fileURLToPath(import.meta.url)), '..'),
    large = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-large') large = false;
    else if (args[i] === '--root' && args[i + 1]) root = resolve(args[++i]);
    else return usage();
  }
  const made = makeTestFiles(join(root, 'test-vault'), { large });
  console.log(`test-vault/: ${made.length} test files made, or already as they should be`);
  return 0;
}

function usage() {
  console.error('Usage: node scripts/make-test-files.mjs [--root DIR] [--no-large]');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
