// Where a thing's image comes from (editor spec §18, animated_image_shown; §13, remote_images_asked). A property whose
// value names an image attached in the vault, as a link or a path, is the thing's image. An address outside the vault
// is never loaded, and a place that could leave the vault is refused, each saying why.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { imageLink, imagesOf, IMAGE_EXTENSIONS, neverMoves } from '../src/image-links.ts';

describe('a property names an image in the vault', () => {
  // proves: animated_image_shown
  test('as a link, an embed or a path from the vault root, each of an image type', () => {
    assert.deepEqual(imageLink('[[cat.gif]]'), { link: 'cat.gif' });
    assert.deepEqual(imageLink('![[Attachments/dance.webp|200]]'), { link: 'Attachments/dance.webp' });
    assert.deepEqual(imageLink('Attachments/spin.apng'), { link: 'Attachments/spin.apng' });
    assert.deepEqual(imageLink('  loop.SVG '), { link: 'loop.SVG' });
    assert.deepEqual(imageLink('[[photo.jpeg]]'), { link: 'photo.jpeg' });
    assert.deepEqual([...IMAGE_EXTENSIONS].sort(), ['apng', 'avif', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
  });

  // proves: animated_image_shown
  test('anything else is no image: other text, a note, a number', () => {
    assert.equal(imageLink('Alice'), null);
    assert.equal(imageLink('[[Some note]]'), null);
    assert.equal(imageLink('notes.md'), null);
    assert.equal(imageLink(42), null);
    assert.equal(imageLink(''), null);
  });

  // proves: animated_image_shown
  test('an address outside the vault is never loaded, and says so', () => {
    for (const remote of [
      'https://example.com/cat.gif',
      'http://x.org/a.png',
      '//cdn.example/b.webp',
      'data:image/gif;base64,R0lG',
    ])
      assert.match(
        imageLink(remote)?.refused ?? '',
        /is outside the vault, and an image from outside the vault is not loaded/,
        remote,
      );
  });

  // proves: animated_image_shown
  test('a place that could leave the vault, or reach what it hides, is refused', () => {
    for (const place of ['../secret.gif', '/etc/cat.gif', 'C:/cat.gif', '.obsidian/icon.png', 'a/../../b.gif'])
      assert.match(imageLink(place)?.refused ?? '', /is not a place inside the vault/, place);
  });

  // proves: animated_image_limited
  test('by its name alone, only a JPEG is known never to move', () => {
    assert.deepEqual(['a.jpg', 'b.JPEG', 'c.png', 'd.gif', 'e.avif', 'f.webp', 'g.svg'].map(neverMoves), [
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  // proves: animated_image_shown
  test('a link is held to the same: no leaving the vault, no hidden folder, no address from elsewhere', () => {
    for (const place of [
      '[[../x.gif]]',
      '[[/etc/x.png]]',
      '[[.obsidian/x.png]]',
      '![[a/../../x.webp]]',
      '[[C:/x.gif]]',
    ])
      assert.match(imageLink(place)?.refused ?? '', /is not a place inside the vault/, place);
    for (const remote of ['file:///etc/x.gif', 'app://local/x.png', '[[file:///etc/x.gif]]', '[[app://local/x.png]]'])
      assert.match(imageLink(remote)?.refused ?? '', /is outside the vault/, remote);
  });

  // proves: animated_image_shown
  test("a thing's images are its properties that name one, in the order of their names", () => {
    assert.deepEqual(imagesOf({ title: 'Tom', photo: '[[tom.gif]]', banner: 'https://x.org/b.png', age: 4 }), [
      {
        property: 'banner',
        value: 'https://x.org/b.png',
        image: {
          refused: 'https://x.org/b.png is outside the vault, and an image from outside the vault is not loaded',
        },
      },
      { property: 'photo', value: '[[tom.gif]]', image: { link: 'tom.gif' } },
    ]);
  });
});
