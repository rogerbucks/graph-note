// An image's bytes written to do harm (editor spec §18, animated_image_limited; spec §9, nothing a file holds freezes
// the page): a header reader that never reads past the bytes there, never loops on a length that does not move it on,
// and reads an SVG's start and root in work that grows with its length and no faster — counted, never timed. A file of
// 200 bytes once took seconds to read, through a pattern that went back over itself (review of #443).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { imageFacts, svgScan } from '../src/image-facts.ts';
import { gif, png, webp } from './image-bytes.js';

const bytes = (s) => new TextEncoder().encode(s);
const be32 = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

describe("an SVG's start and root are read in linear work", () => {
  // proves: animated_image_limited
  test('200 empty comments before anything: each looked at once, and it is no SVG', () => {
    const text = '<!---->'.repeat(200) + 'x';
    const scan = svgScan(text);
    assert.equal(scan.start, null);
    assert.ok(scan.looked <= text.length, `${scan.looked} characters looked at, of ${text.length}`);
    assert.equal(imageFacts(bytes(text)).format, null);
  });

  // proves: animated_image_limited
  test('200 comments, then the root: an SVG, found by looking at each character once', () => {
    const text = '<!-- a -->\n'.repeat(200) + '<svg width="40" height="30"></svg>';
    const scan = svgScan(text);
    assert.equal(scan.start, text.indexOf('<svg'));
    assert.ok(scan.looked <= text.length, `${scan.looked} of ${text.length}`);
    assert.equal(imageFacts(bytes(text)).width, 40);
  });

  // proves: animated_image_limited
  test('comments that look nested, and dashes inside a comment, end at the first -->', () => {
    const text = '<!-- <!-- inner --> <svg width="5" height="6"/>';
    assert.equal(svgScan(text).start, text.indexOf('<svg'));
    assert.equal(svgScan('<!-- a - b -- c --><svg/>').start, 19);
    assert.equal(svgScan('<!-- never closed <svg>').start, null);
  });

  // proves: animated_image_limited
  test('a root that never closes, many times over: read once, with no size', () => {
    for (const n of [1000, 4000]) {
      const text = '<svg '.repeat(n);
      const scan = svgScan(text);
      assert.equal(scan.start, 0);
      assert.equal(scan.root, '');
      assert.ok(scan.looked <= 2 * text.length, `${scan.looked} of ${text.length}`);
      assert.deepEqual(imageFacts(bytes(text)), { format: 'svg', animated: false, frames: 1, width: 0, height: 0 });
    }
  });
});

describe('lengths and ends that lie are read as far as the bytes go', () => {
  // proves: animated_image_limited
  test('a GIF whose blocks claim more than is there, or stop part way, at every length', () => {
    const lying = Uint8Array.from([...gif({ frames: 1 }).slice(0, -2), 0xff, 0xff, 0xff]);
    assert.equal(imageFacts(lying).format, 'gif');
    const whole = gif({ frames: 3 });
    for (let n = 0; n <= whole.length; n++) assert.doesNotThrow(() => imageFacts(whole.slice(0, n)), `cut at ${n}`);
  });

  // proves: animated_image_limited
  test('a PNG chunk claiming 4 GB, and an animation control cut short', () => {
    const head = png({ width: 3, height: 3 }).slice(0, 33);
    const huge = Uint8Array.from([...head, ...be32(0xffffffff), 0x74, 0x45, 0x58, 0x74, 1, 2, 3]);
    assert.deepEqual(imageFacts(huge), { format: 'png', animated: false, frames: 1, width: 3, height: 3 });
    const apng = png({ frames: 9 });
    for (let n = 0; n <= apng.length; n++) assert.doesNotThrow(() => imageFacts(apng.slice(0, n)), `cut at ${n}`);
  });

  // proves: animated_image_limited
  test('a WebP chunk claiming 4 GB, and frames cut short', () => {
    const anim = webp({ width: 4, height: 4, frames: 3 });
    const huge = Uint8Array.from([...anim.slice(0, 30), 0x41, 0x4e, 0x4d, 0x46, ...le32(0xffffffff), 9, 9]);
    assert.equal(imageFacts(huge).format, 'webp');
    for (let n = 0; n <= anim.length; n++) assert.doesNotThrow(() => imageFacts(anim.slice(0, n)), `cut at ${n}`);
  });
});
