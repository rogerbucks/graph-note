// Small images made byte by byte for the tests of animated images (editor spec §18): a GIF, a PNG or APNG, a WebP and an
// SVG, each still or moving, of a size and frame count given, laid out as each format writes them. Only the parts the
// header reader looks at are real; the picture data itself is a placeholder, as nothing here is decoded for display.

const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const le16 = (n) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const le32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const be32 = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/** A GIF of `frames` frames, `width` by `height`, each frame a graphic control extension and an image. */
export function gif({ width = 2, height = 2, frames = 1, loop = frames > 1 } = {}) {
  const out = [...ascii('GIF89a'), ...le16(width), ...le16(height), 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff];
  if (loop) out.push(0x21, 0xff, 0x0b, ...ascii('NETSCAPE2.0'), 0x03, 0x01, 0, 0, 0);
  for (let i = 0; i < frames; i++)
    out.push(
      0x21,
      0xf9,
      0x04,
      0,
      0x0a,
      0,
      0,
      0,
      0x2c,
      0,
      0,
      0,
      0,
      ...le16(width),
      ...le16(height),
      0,
      0x02,
      0x02,
      0x44,
      0x01,
      0,
    );
  out.push(0x3b);
  return Uint8Array.from(out);
}

/** A PNG chunk: its length, type, data and a placeholder check value. */
const chunk = (type, data) => [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];

/** A PNG, `width` by `height`; with `frames`, an APNG whose acTL says it has that many. */
export function png({ width = 2, height = 2, frames = 0 } = {}) {
  const ihdr = [...be32(width), ...be32(height), 8, 6, 0, 0, 0];
  const actl = frames ? chunk('acTL', [...be32(frames), ...be32(0)]) : [];
  return Uint8Array.from([
    0x89,
    ...ascii('PNG'),
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', ihdr),
    ...actl,
    ...chunk('IDAT', [0x78, 0x9c, 0, 0]),
    ...chunk('IEND', []),
  ]);
}

/** A RIFF chunk, padded to an even length. */
const riff = (type, data) => [...ascii(type), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])];

/** A WebP, `width` by `height`: extended with the animation flag and `frames` ANMF chunks when it moves, else lossless. */
export function webp({ width = 2, height = 2, frames = 0 } = {}) {
  const body = frames
    ? [
        ...riff('VP8X', [0x02, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]),
        ...riff('ANIM', [0, 0, 0, 0, 0, 0]),
        ...Array.from({ length: frames }, () => riff('ANMF', [...new Array(16).fill(0), 1, 2, 3])).flat(),
      ]
    : riff('VP8L', [0x2f, ...le32(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)), 0]);
  const all = [...ascii('WEBP'), ...body];
  return Uint8Array.from([...ascii('RIFF'), ...le32(all.length), ...all]);
}

/** An SVG, `width` by `height`, its circle moved by an animate element when it `moves`. */
export function svg({ width = 40, height = 30, moves = false } = {}) {
  const animate = moves ? '<animate attributeName="r" values="4;8;4" dur="1s" repeatCount="indefinite"/>' : '';
  const text = `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><circle cx="10" cy="10" r="4">${animate}</circle></svg>`;
  return new TextEncoder().encode(text);
}

/** A JPEG's first bytes: a photograph, which never moves. */
export const jpeg = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...ascii('JFIF'), 0, 0xff, 0xd9]);
