// The files the tests need are made by the repository, not supplied by hand (editor spec §12, tests_self_contained,
// test_files_generated). The device-check notes under test-vault/ name images and a PDF; the generator in
// scripts/make-test-files.mjs makes every one, into a copy of the notes here, never the committed tree. Each made image is
// held to what its own bytes say (the core's header reader), and decoded: the GIF's compressed data by a decoder written
// here, the APNG's frames by zlib and its check values, the WebP's frame by a reader of the lossless format.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { imageFacts } from '../packages/core/src/image-facts.ts';
import { IMAGE_LIMITS } from '../packages/core/src/image-limits.ts';
import { TEST_FILES, makeTestFiles, pixelsOf } from '../scripts/make-test-files.mjs';
import { notIgnored, path, walk } from './repository/repo.js';

const NOTES = 'test-vault/Device checks';
/** A file of a format the notes name that is not a note: `[[cat.gif]]`, `[[report.pdf]]`. */
const NAMED = /\[\[([^\]|#]+\.(?:gif|png|webp|svg|pdf|jpe?g|avif))(?:[|#][^\]]*)?\]\]/gi;

/** The names the device-check notes give to files that are not notes, each once. */
const namedByNotes = () => {
  const names = new Set();
  for (const f of walk(NOTES).filter((f) => f.endsWith('.md')))
    for (const m of readFileSync(path(f), 'utf8').matchAll(NAMED)) names.add(basename(m[1]));
  return [...names].sort();
};

/** Every file under a folder, as full paths. */
const filesUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)],
  );

let vault;
let made;
before(() => {
  vault = mkdtempSync(join(tmpdir(), 'graph-note-test-files-'));
  cpSync(path(NOTES), join(vault, 'Device checks'), {
    recursive: true,
    filter: (src) => !statSync(src).isFile() || src.endsWith('.md'),
  });
  made = makeTestFiles(vault);
});

const whereIs = (name) => filesUnder(vault).find((f) => basename(f) === name);
const bytesOf = (entry) => new Uint8Array(readFileSync(join(vault, 'Device checks', entry.folder, entry.name)));
const be32 = (b, at) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const le32 = (b, at) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const le16 = (b, at) => b[at] | (b[at + 1] << 8);
const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n));

describe('the generator makes every file the device-check notes name', () => {
  // proves: tests_self_contained, test_files_generated
  test('after it runs, every image and PDF a note names exists', () => {
    const names = namedByNotes();
    assert.ok(names.length >= 20, `the notes name their files (${names.length})`);
    for (const name of names) assert.ok(whereIs(name), `${name} is made by the generator`);
    assert.ok(made.length >= names.length, 'it reports what it made');
  });

  // proves: test_files_generated
  test('it makes nothing a note does not name, and nothing outside the copy it was given', () => {
    const names = new Set(namedByNotes());
    for (const f of filesUnder(vault).filter((f) => !f.endsWith('.md')))
      assert.ok(names.has(basename(f)), `${basename(f)} is named`);
    assert.deepEqual(
      TEST_FILES.map((e) => e.name).sort(),
      [...names],
      'the generator lists exactly the names the notes give',
    );
  });

  // proves: test_files_generated
  test('the files kept in the repository are what the generator makes, byte for byte, and the large one is not kept', () => {
    for (const e of TEST_FILES.filter((e) => !e.large)) {
      const kept = path(`test-vault/Device checks/${e.folder}/${e.name}`);
      assert.ok(existsSync(kept), `${e.name} is committed`);
      assert.ok(notIgnored(`test-vault/Device checks/${e.folder}/${e.name}`), `${e.name} is not ignored`);
      assert.ok(
        readFileSync(kept).equals(readFileSync(join(vault, 'Device checks', e.folder, e.name))),
        `${e.name} is current`,
      );
    }
    for (const e of TEST_FILES.filter((e) => e.large)) {
      assert.ok(!notIgnored(`test-vault/Device checks/${e.folder}/${e.name}`), `${e.name} is ignored, made at set-up`);
    }
  });
});

describe('each made image says what the generator meant it to be', () => {
  // proves: test_files_generated
  test('the header reader reports the format, whether it moves and the frame count intended', () => {
    for (const e of TEST_FILES.filter((e) => e.format !== 'pdf')) {
      const facts = imageFacts(bytesOf(e));
      assert.equal(facts.format, e.format, `${e.name} format`);
      assert.equal(facts.frames, e.frames, `${e.name} frames`);
      assert.equal(facts.animated, e.animated, `${e.name} moves`);
      if (e.format !== 'svg') assert.deepEqual([facts.width, facts.height], [e.width, e.height], `${e.name} size`);
    }
    assert.ok(TEST_FILES.filter((e) => e.animated).length >= 14, 'a dozen and more moving images');
  });

  // proves: test_files_generated
  test('the large GIF is over the size limit by its size on disk, and within every other limit', () => {
    const big = TEST_FILES.find((e) => e.large);
    const bytes = bytesOf(big);
    assert.ok(bytes.length > IMAGE_LIMITS.bytes, `${bytes.length} bytes is over ${IMAGE_LIMITS.bytes}`);
    assert.ok(bytes.length < 3 * IMAGE_LIMITS.bytes, 'and not many times over');
    const facts = imageFacts(bytes);
    assert.ok(
      facts.animated && facts.frames <= IMAGE_LIMITS.frames && facts.width * facts.height <= IMAGE_LIMITS.pixels,
    );
  });

  // proves: test_files_generated
  test('each small image is small', () => {
    for (const e of TEST_FILES.filter((e) => !e.large))
      assert.ok(bytesOf(e).length < 20_000, `${e.name} is ${bytesOf(e).length} bytes`);
  });
});

/** A GIF's frames, read by a decoder of the format's own LZW compression: one list of palette indices for each frame. */
function decodeGif(b) {
  const packed = b[10];
  let at = 13 + (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0);
  const frames = [];
  const subBlocks = () => {
    const data = [];
    while (b[at] !== 0) {
      data.push(...b.subarray(at + 1, at + 1 + b[at]));
      at += b[at] + 1;
    }
    at++;
    return data;
  };
  while (b[at] !== 0x3b) {
    if (b[at] === 0x21) {
      at += 2;
      subBlocks();
    } else {
      assert.equal(b[at], 0x2c, 'an image follows');
      const [w, h] = [le16(b, at + 5), le16(b, at + 7)];
      const local = b[at + 9];
      at += 10 + (local & 0x80 ? 3 * 2 ** ((local & 7) + 1) : 0);
      const min = b[at++];
      frames.push(lzw(Uint8Array.from(subBlocks()), min, w * h));
    }
  }
  return frames;
}

/** GIF LZW decoding: codes of a growing width, a table of strings, a clear code and an end code. */
function lzw(data, min, count) {
  const clear = 1 << min,
    end = clear + 1,
    out = [];
  let table,
    size,
    prev,
    bit = 0;
  const reset = () => {
    table = Array.from({ length: clear }, (_, i) => [i]);
    table.push(null, null);
    size = min + 1;
    prev = null;
  };
  reset();
  while (out.length < count) {
    let code = 0;
    for (let i = 0; i < size; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
    assert.ok(bit <= data.length * 8, 'the data ends with an end code');
    if (code === clear) {
      reset();
      continue;
    }
    if (code === end) break;
    let entry;
    if (code < table.length) entry = table[code];
    else {
      assert.equal(code, table.length, 'a code is at most the next one');
      entry = [...prev, prev[0]];
    }
    out.push(...entry);
    if (prev) table.push([...prev, entry[0]]);
    prev = entry;
    if (table.length === 1 << size && size < 12) size++;
  }
  return out;
}

describe('the GIFs decode: their compressed data gives back the frames meant', () => {
  const gifs = () => TEST_FILES.filter((e) => e.format === 'gif');

  // proves: test_files_generated
  test('every GIF, the large one included, decodes to one list of indices for each frame, as the generator drew it', () => {
    for (const e of gifs()) {
      const frames = decodeGif(bytesOf(e));
      assert.equal(frames.length, e.frames, `${e.name} frames`);
      frames.forEach((f, i) => assert.deepEqual(f, [...pixelsOf(e, i)], `${e.name} frame ${i}`));
    }
  });

  // proves: test_files_generated
  test('the frames of a moving GIF differ from one another, so it moves', () => {
    for (const e of gifs()) {
      const frames = decodeGif(bytesOf(e)).map((f) => f.join());
      assert.equal(new Set(frames).size, frames.length, `${e.name}: no two frames alike`);
    }
  });

  // proves: test_files_generated
  test('the seven cats of one check are not the same file', () => {
    const cats = TEST_FILES.filter((e) => /^c\d\.gif$/.test(e.name)).map((e) =>
      Buffer.from(bytesOf(e)).toString('hex'),
    );
    assert.equal(cats.length, 7);
    assert.equal(new Set(cats).size, 7);
  });
});

/** A PNG's chunks: type, data and whether the check value over both is right. */
function chunksOf(b) {
  const crcOf = (data) => {
    let c = ~0;
    for (const x of data) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const out = [];
  for (let at = 8; at < b.length;) {
    const n = be32(b, at);
    out.push({
      type: ascii(b, at + 4, 4),
      data: b.subarray(at + 8, at + 8 + n),
      ok: crcOf(b.subarray(at + 4, at + 8 + n)) === be32(b, at + 8 + n),
    });
    at += 12 + n;
  }
  return out;
}

describe('the PNGs decode: their chunks are sound and their frames inflate to the pixels meant', () => {
  const pngs = () => TEST_FILES.filter((e) => e.format === 'png');

  // proves: test_files_generated
  test('every chunk of every PNG has its right check value, and the file ends with IEND', () => {
    for (const e of pngs()) {
      const chunks = chunksOf(bytesOf(e));
      assert.ok(
        chunks.every((c) => c.ok),
        `${e.name}: every chunk's check value`,
      );
      assert.equal(chunks[0].type, 'IHDR');
      assert.equal(chunks.at(-1).type, 'IEND');
    }
  });

  // proves: test_files_generated
  test('the APNG has an acTL naming its frames, an fcTL for each, and numbered frame data that inflates to its pixels', () => {
    const e = TEST_FILES.find((e) => e.name === 'spin.png');
    const chunks = chunksOf(bytesOf(e));
    const actl = chunks.find((c) => c.type === 'acTL');
    assert.equal(be32(actl.data, 0), e.frames);
    const controls = chunks.filter((c) => c.type === 'fcTL');
    assert.equal(controls.length, e.frames);
    const sequence = chunks.filter((c) => c.type === 'fcTL' || c.type === 'fdAT').map((c) => be32(c.data, 0));
    assert.deepEqual(
      sequence,
      sequence.map((_, i) => i),
      'sequence numbers run 0, 1, 2 …',
    );
    const data = [Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data))];
    for (const c of chunks.filter((c) => c.type === 'fdAT')) data.push(c.data.subarray(4));
    assert.equal(data.length, e.frames, 'IDAT is the first frame; each other frame is one fdAT');
    data.forEach((d, i) => {
      const raw = inflateSync(d);
      assert.equal(raw.length, e.height * (1 + 4 * e.width), `frame ${i} inflates to its rows`);
      const rgba = pixelsOf(e, i);
      for (let y = 0; y < e.height; y++) {
        assert.equal(raw[y * (1 + 4 * e.width)], 0, 'filter none');
        assert.deepEqual(
          [...raw.subarray(y * (1 + 4 * e.width) + 1, (y + 1) * (1 + 4 * e.width))],
          [...rgba.subarray(y * 4 * e.width, (y + 1) * 4 * e.width)],
        );
      }
    });
  });
});

/** A reader of the lossless WebP format as the generator writes it: prefix codes of one or two symbols for each channel. */
function decodeVp8l(b) {
  assert.equal(b[0], 0x2f, 'the lossless signature');
  let bit = 40;
  const read = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++, bit++) v |= ((b[bit >> 3] >> (bit & 7)) & 1) << i;
    return v;
  };
  const head = le32(b, 1);
  const w = (head & 0x3fff) + 1,
    h = ((head >> 14) & 0x3fff) + 1;
  assert.equal(read(3), 0, 'no transform, no colour cache, no meta codes');
  const codes = Array.from({ length: 5 }, () => {
    assert.equal(read(1), 1, 'a simple code');
    const two = read(1);
    const first = read(1) ? read(8) : read(1);
    return two ? [first, read(8)].sort((p, q) => p - q) : [first];
  });
  const out = new Uint8Array(w * h * 4);
  const pick = (code) => (code.length === 1 ? code[0] : code[read(1)]);
  for (let i = 0; i < w * h; i++) {
    const g = pick(codes[0]),
      r = pick(codes[1]),
      bl = pick(codes[2]),
      a = pick(codes[3]);
    out.set([r, g, bl, a], i * 4);
  }
  return { w, h, rgba: out };
}

describe('the animated WebP decodes: its frames are lossless images of the pixels meant', () => {
  // proves: test_files_generated
  test('the RIFF sizes agree, the animation chunk is there, and each frame reads back as drawn', () => {
    const e = TEST_FILES.find((e) => e.format === 'webp');
    const b = bytesOf(e);
    assert.equal(ascii(b, 0, 4), 'RIFF');
    assert.equal(le32(b, 4), b.length - 8, 'RIFF size');
    assert.equal(ascii(b, 12, 4), 'VP8X');
    assert.ok(b[20] & 0x02, 'the animation flag');
    let frames = 0,
      sawAnim = false;
    for (let at = 12 + 18; at < b.length;) {
      const type = ascii(b, at, 4),
        size = le32(b, at + 4);
      if (type === 'ANIM') sawAnim = true;
      if (type === 'ANMF') {
        const inner = at + 8 + 16;
        assert.equal(ascii(b, inner, 4), 'VP8L');
        const { w, h, rgba } = decodeVp8l(b.subarray(inner + 8, inner + 8 + le32(b, inner + 4)));
        assert.deepEqual([w, h], [e.width, e.height]);
        assert.deepEqual([...rgba], [...pixelsOf(e, frames)], `frame ${frames}`);
        frames++;
      }
      at += 8 + size + (size % 2);
      assert.ok(at <= b.length, 'chunks end with the file');
    }
    assert.ok(sawAnim);
    assert.equal(frames, e.frames);
  });
});

describe('the SVG and the PDF are well formed', () => {
  // proves: test_files_generated
  test('the SVG animates with an animate element and loads nothing from elsewhere', () => {
    const e = TEST_FILES.find((e) => e.format === 'svg');
    const text = Buffer.from(bytesOf(e)).toString('utf8');
    assert.match(text, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(text, /<animate\b/);
    assert.ok(text.trimEnd().endsWith('</svg>'));
    assert.doesNotMatch(text, /href|url\(|<script|<image/i);
  });

  // proves: test_files_generated
  test('the PDF has a header, objects where its table says, a trailer and an end', () => {
    const e = TEST_FILES.find((e) => e.format === 'pdf');
    const text = Buffer.from(bytesOf(e)).toString('latin1');
    assert.match(text, /^%PDF-1\.\d\n/);
    assert.match(text, /%%EOF\n?$/);
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
    assert.equal(text.slice(start, start + 4), 'xref');
    const count = Number(/xref\n0 (\d+)\n/.exec(text.slice(start))[1]);
    const offsets = [...text.slice(start).matchAll(/^(\d{10}) \d{5} n ?$/gm)].map((m) => Number(m[1]));
    assert.equal(offsets.length, count - 1);
    offsets.forEach((o, i) => assert.equal(text.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
    assert.match(text, /\/Type \/Catalog/);
  });
});
