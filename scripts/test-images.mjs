// Encoders for the images and the PDF the tests and the device checks need (editor spec §12, test_files_generated). Each
// writes the real format and nothing more: a GIF with LZW-compressed frames, an APNG with zlib-wrapped frames, a lossless
// animated WebP, an animated SVG and a one-page PDF. No network and no dependency but node:zlib. Everything is
// deterministic (zlib's stored blocks, not a compression level whose output differs between zlib versions), so a file
// kept in the repository can be compared with a fresh one byte for byte. scripts/make-test-files.mjs says which files to
// make; test/test-files.test.js decodes what these write.
import { deflateSync } from 'node:zlib';

const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const le16 = (n) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const le32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const be32 = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/** The eight colours of the small test pictures: each of red, green and blue low or high; index = red + 2 green + 4 blue. */
export const CUBE = Array.from({ length: 8 }, (_, i) => [i & 1 ? 215 : 40, i & 2 ? 215 : 40, i & 4 ? 215 : 40]);

/** LZW as a GIF writes it: codes of a growing width over a table of strings, cleared when full, packed low bit first. */
export function lzw(pixels, minCode) {
  const clear = 1 << minCode,
    end = clear + 1,
    out = [];
  let size = minCode + 1,
    next = end + 1,
    acc = 0,
    held = 0,
    table = new Map();
  const emit = (code) => {
    acc |= code << held;
    held += size;
    while (held >= 8) {
      out.push(acc & 0xff);
      acc >>>= 8;
      held -= 8;
    }
  };
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const c = pixels[i],
      key = prefix * 256 + c,
      known = table.get(key);
    if (known !== undefined) {
      prefix = known;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      table.set(key, next);
      if (next === 1 << size && size < 12) size++;
      next++;
    } else {
      emit(clear);
      table = new Map();
      size = minCode + 1;
      next = end + 1;
    }
    prefix = c;
  }
  emit(prefix);
  emit(end);
  if (held > 0) out.push(acc & 0xff);
  return out;
}

/** Bytes as a GIF's data sub-blocks: each a length of at most 255 then that many bytes, ended by a zero. */
const subBlocks = (bytes) => {
  const out = [];
  for (let at = 0; at < bytes.length; at += 255)
    out.push(Math.min(255, bytes.length - at), ...bytes.slice(at, at + 255));
  out.push(0);
  return out;
};

/** An animated GIF: `frames` are lists of palette indices, `width` by `height`; the palette is padded to a power of two. */
export function gif({ width, height, palette, frames, delay = 12 }) {
  const bits = Math.max(2, Math.ceil(Math.log2(palette.length))),
    table = Array.from({ length: 1 << bits }, (_, i) => palette[i] ?? [0, 0, 0]);
  const out = [
    ...ascii('GIF89a'),
    ...le16(width),
    ...le16(height),
    0x80 | ((bits - 1) << 4) | (bits - 1),
    0,
    0,
    ...table.flat(),
  ];
  if (frames.length > 1) out.push(0x21, 0xff, 0x0b, ...ascii('NETSCAPE2.0'), 0x03, 0x01, 0, 0, 0);
  for (const f of frames) {
    out.push(0x21, 0xf9, 0x04, 0, ...le16(delay), 0, 0, 0x2c, 0, 0, 0, 0, ...le16(width), ...le16(height), 0, bits);
    for (const b of subBlocks(lzw(f, bits))) out.push(b);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const x of bytes) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** A PNG chunk: length, type, data and the check value over type and data. */
const chunk = (type, data) => {
  const body = [...ascii(type), ...data];
  return [...be32(data.length), ...body, ...be32(crc32(body))];
};
/** One frame's scanlines, filter none, as zlib wraps them. */
const scanlines = (rgba, width, height) => {
  const rows = [];
  for (let y = 0; y < height; y++) rows.push(0, ...rgba.subarray(y * width * 4, (y + 1) * width * 4));
  return [...deflateSync(Uint8Array.from(rows), { level: 0 })];
};
const SIGNATURE = [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG; with more than one frame (each RGBA bytes, `width` by `height`), an APNG that loops for ever. */
export function png({ width, height, frames, delay = 12 }) {
  const out = [...SIGNATURE, ...chunk('IHDR', [...be32(width), ...be32(height), 8, 6, 0, 0, 0])];
  const moving = frames.length > 1;
  if (moving) out.push(...chunk('acTL', [...be32(frames.length), ...be32(0)]));
  let sequence = 0;
  frames.forEach((rgba, i) => {
    const data = scanlines(rgba, width, height);
    if (moving) {
      const control = [...be32(sequence++), ...be32(width), ...be32(height), ...be32(0), ...be32(0)];
      out.push(...chunk('fcTL', [...control, (delay >> 8) & 0xff, delay & 0xff, 0, 100, 0, 0]));
    }
    if (i === 0) out.push(...chunk('IDAT', data));
    else out.push(...chunk('fdAT', [...be32(sequence++), ...data]));
  });
  out.push(...chunk('IEND', []));
  return Uint8Array.from(out);
}

/** A RIFF chunk: type, size, data, and a pad byte when the size is odd. */
const riff = (type, data) => [...ascii(type), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])];

/**
 * A lossless (VP8L) image of RGBA bytes, written with the simplest prefix codes the format has: for each channel a code
 * of one or two symbols, so each pixel is at most one bit of each of green, red, blue and alpha. It holds any picture
 * whose channels each take at most two values, which the eight-colour test pictures do.
 */
function vp8l(width, height, rgba) {
  const out = [0x2f];
  let acc = 0,
    held = 0;
  const put = (v, n) => {
    for (let i = 0; i < n; i++) {
      acc |= ((v >> i) & 1) << held;
      if (++held === 8) {
        out.push(acc);
        acc = held = 0;
      }
    }
  };
  put(width - 1, 14);
  put(height - 1, 14);
  put(0, 4); // alpha not used, version 0
  put(0, 3); // no transform, no colour cache, one set of prefix codes
  const order = [1, 0, 2, 3]; // green, red, blue, alpha
  const symbols = order.map((c) =>
    [...new Set(Array.from({ length: width * height }, (_, i) => rgba[i * 4 + c]))].sort((p, q) => p - q),
  );
  for (const s of symbols) {
    if (s.length > 2) throw new Error('a lossless test picture holds at most two values of each channel');
    put(1, 1); // a simple code
    put(s.length - 1, 1);
    put(1, 1); // the first symbol in 8 bits
    put(s[0], 8);
    if (s.length === 2) put(s[1], 8);
  }
  put(1, 1); // the distance code, never used
  put(0, 1);
  put(1, 1);
  put(0, 8);
  for (let i = 0; i < width * height; i++)
    order.forEach((c, k) => {
      if (symbols[k].length === 2) put(rgba[i * 4 + c] === symbols[k][1] ? 1 : 0, 1);
    });
  if (held) out.push(acc);
  return out;
}

/** An animated WebP: a VP8X header, an ANIM chunk that loops for ever, and an ANMF chunk holding a lossless frame each. */
export function webp({ width, height, frames, delay = 120 }) {
  const frame = (rgba) =>
    riff('ANMF', [
      0,
      0,
      0,
      0,
      0,
      0,
      ...le24(width - 1),
      ...le24(height - 1),
      ...le24(delay),
      0,
      ...riff('VP8L', vp8l(width, height, rgba)),
    ]);
  const body = [
    ...ascii('WEBP'),
    ...riff('VP8X', [0x02, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]),
    ...riff('ANIM', [0xff, 0xff, 0xff, 0xff, 0, 0]),
    ...frames.flatMap(frame),
  ];
  return Uint8Array.from([...ascii('RIFF'), ...le32(body.length), ...body]);
}

/** An SVG that moves: a circle sliding across a square by an `animate` element. Nothing in it loads from elsewhere. */
export const svg = ({ size = 64, colour = '#d7d728' } = {}) =>
  Uint8Array.from(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">\n` +
        `  <rect width="${size}" height="${size}" fill="#282828"/>\n` +
        `  <circle cx="12" cy="${size / 2}" r="8" fill="${colour}">\n` +
        `    <animate attributeName="cx" values="12;${size - 12};12" dur="2s" repeatCount="indefinite"/>\n` +
        `  </circle>\n</svg>\n`,
    ),
  );

/** A one-page PDF saying `text`: a catalog, a page tree, a page, its content and a font, with the table of where each is. */
export function pdf(text) {
  const content = `BT /F1 18 Tf 20 50 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let file = '%PDF-1.5\n';
  const offsets = objects.map((o, i) => {
    const at = file.length;
    file += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  // the table of where each object is, as a cross-reference stream (PDF 1.5): an entry of four bytes (1, two bytes of
  // offset, 0) for each object, the free entry for object 0 first, the stream itself last; zlib-wrapped like a PNG's data
  const at = file.length,
    entries = [[0, 0, 255], ...offsets.map((o) => [1, o, 0]), [1, at, 0]];
  const table = Buffer.from(entries.flatMap(([type, offset, gen]) => [type, offset >> 8, offset & 0xff, gen]));
  const packed = deflateSync(table, { level: 0 }).toString('latin1');
  file += `${objects.length + 1} 0 obj\n<< /Type /XRef /Size ${entries.length} /W [1 2 1] /Root 1 0 R /Filter /FlateDecode /Length ${packed.length} >>\nstream\n${packed}\nendstream\nendobj\n`;
  file += `startxref\n${at}\n%%EOF\n`;
  return Uint8Array.from(Buffer.from(file, 'latin1'));
}
