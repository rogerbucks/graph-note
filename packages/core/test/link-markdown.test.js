// The Markdown a host renders for a thing's details (editor spec §18, rich_details, safe_to_click; §13). Every way
// found for raw HTML, a remote image or a script link to slip past `safeMarkdown` to the renderer is closed. The ways
// are maths, an escaped backtick, a fence that is not one, an image with no words, and a titled destination. They also
// include a reference definition and a destination that starts with an encoded space. Nothing remote is loaded, so
// nothing reaches the network (§13).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  embedParts,
  embeddedMarkdown,
  embeddedRemoteImages,
  remoteImagesIn,
  safeMarkdown,
} from '../src/link-markdown.ts';

describe('raw HTML never reaches the renderer', () => {
  test('inside maths, as anywhere: an image is a link to it, any other tag text', () => {
    assert.equal(safeMarkdown('$ <img src=https://x.org/a.png> $'), '$ [https://x.org/a.png](https://x.org/a.png) $');
    assert.equal(safeMarkdown('$5 <iframe src=https://x.org> and $6'), '$5 &lt;iframe src=https://x.org> and $6');
    assert.equal(
      safeMarkdown('Maths $E = mc^2$ and a < b'),
      'Maths $E = mc^2$ and a < b',
      'maths with no tag is as written',
    );
  });

  test('a backtick after an odd number of backslashes opens no code span; after an even number it does', () => {
    assert.equal(
      safeMarkdown('\\`<img src="https://x.org/a.png">\\`'),
      '\\`[https://x.org/a.png](https://x.org/a.png)\\`',
    );
    assert.equal(safeMarkdown('\\\\`<b>`'), '\\\\`<b>`', 'an escaped backslash leaves the backtick to open the span');
  });

  test('a backtick fence with a backtick in its words is no fence; a fence closes only on a line of its marks alone', () => {
    assert.equal(
      safeMarkdown('```x`\n<img src="https://x.org/a.png">'),
      '```x`\n[https://x.org/a.png](https://x.org/a.png)',
    );
    assert.equal(safeMarkdown('```\n<b>\n```js\n<i>\n```\n<u>'), '```\n<b>\n```js\n<i>\n```\n&lt;u>');
    assert.equal(
      safeMarkdown('~~~ a`b\n<b>\n~~~\n<u>'),
      '~~~ a`b\n<b>\n~~~\n&lt;u>',
      'a tilde fence may hold a backtick',
    );
  });
});

describe('a remote image is a link that shows where it is', () => {
  test('an image with no words is a link showing its address, never an empty one', () => {
    assert.equal(safeMarkdown('![](https://x.org/a.png)'), '[https://x.org/a.png](https://x.org/a.png)');
    assert.equal(safeMarkdown('<img src="https://x.org/t.gif">'), '[https://x.org/t.gif](https://x.org/t.gif)');
  });

  test('the images from the web it made links are listed, for the host to load when asked (remote_images_asked)', () => {
    const text = [
      '![a](https://x.org/a.png) [b](https://x.org/b.png) <img src=https://x.org/t.gif>',
      '![[photo.png]] ![again](https://x.org/a.png) `![code](https://x.org/c.png)`',
      '```',
      '![fenced](https://x.org/f.png)',
      '```',
    ].join('\n');
    // each once, in the order written: not a plain link, a vault file, code or a fence
    assert.deepEqual(remoteImagesIn(text), ['https://x.org/a.png', 'https://x.org/t.gif']);
    assert.deepEqual(remoteImagesIn('![x](javascript:alert(1)) ![y](mailto:a@b)'), []);
    const note = ['---', 'cover: x', '---', '![](https://x.org/top.png)', '## Route', '![](https://x.org/r.png)'];
    assert.deepEqual(embeddedRemoteImages(note.join('\n')), ['https://x.org/top.png', 'https://x.org/r.png']);
    assert.deepEqual(embeddedRemoteImages(note.join('\n'), 'Route'), ['https://x.org/r.png']);
  });
});

describe('a script link is text before anything renders it (safe_to_click)', () => {
  test('a destination with a title, a space or an encoded space before it', () => {
    assert.equal(safeMarkdown('[x](javascript:void0 "t")'), '\\[x](javascript:void0 "t")');
    assert.equal(safeMarkdown('[x]( javascript:void0)'), '\\[x]( javascript:void0)');
    assert.equal(safeMarkdown('[x](&#32;javascript:void0)'), '\\[x](&#32;javascript:void0)');
    assert.equal(
      safeMarkdown('[x](https://x.org "t")'),
      '[x](https://x.org "t")',
      'a web address with a title is kept',
    );
  });

  test('a reference definition of a script address defines nothing; one of a web address is kept', () => {
    assert.equal(safeMarkdown('[r]: javascript:void0'), '\\[r]: javascript:void0');
    assert.equal(safeMarkdown('  [r]: <javascript:void0>'), '  \\[r]: &lt;javascript:void0>');
    assert.equal(safeMarkdown('[r]: https://x.org'), '[r]: https://x.org');
  });

  test('a reference definition whose destination is on the next line is judged by that line', () => {
    assert.equal(safeMarkdown('[r]:\n  javascript:void0'), '\\[r]:\n  javascript:void0');
    assert.equal(safeMarkdown('  [r]:  \n<javascript:void0>'), '  \\[r]:  \n&lt;javascript:void0>');
    assert.equal(safeMarkdown('[r]:\n  https://x.org'), '[r]:\n  https://x.org', 'a web address is kept');
  });
});

describe('only a file that cannot load anything is embedded (offline_and_mobile_apis)', () => {
  test('an image, a sound, a video or a PDF of the vault is shown in place; a canvas, a base or any other file is a link', () => {
    assert.equal(
      safeMarkdown('![[p.png]] ![[s.mp3]] ![[v.mp4]] ![[d.pdf]] ![x](scans/q.jpg)'),
      '![[p.png]] ![[s.mp3]] ![[v.mp4]] ![[d.pdf]] ![x](scans/q.jpg)',
    );
    assert.equal(
      safeMarkdown('![[a.canvas]] ![[b.base]] ![[t.csv]] ![x](c.canvas)'),
      '[[a.canvas]] [[b.base]] [[t.csv]] [x](c.canvas)',
    );
  });
});

describe('an embedded note loads nothing remote (rich_details, offline_and_mobile_apis)', () => {
  test('each note embed is split out for the host to read and make safe itself; never one in code, never a file', () => {
    const parts = embedParts('Before ![[Trip plan]] and ![m](Maps/Map.md) after `![[Not this]]`, ![[photo.png]]');
    assert.deepEqual(
      parts.map((p) => ('embed' in p ? ['embed', p.embed.target] : ['text', p.text])),
      [
        ['text', 'Before '],
        ['embed', 'Trip plan'],
        ['text', ' and '],
        ['embed', 'Maps/Map.md'],
        ['text', ' after `![[Not this]]`, ![[photo.png]]'],
      ],
    );
    assert.deepEqual(embedParts('```\n![[Fenced]]\n```'), [{ text: '```\n![[Fenced]]\n```' }]);
  });

  test('a note embed never reaches the renderer: made safe, it is a link; a file embed is kept', () => {
    assert.equal(safeMarkdown('![[Trip plan]] and ![m](Maps/Map.md)'), '[[Trip plan]] and [m](Maps/Map.md)');
    assert.equal(safeMarkdown('![](Maps/Map.md) and ![[photo.png]]'), '[Maps/Map.md](Maps/Map.md) and ![[photo.png]]');
  });

  test('an embedded note’s text: its front matter left out, each remote image a link showing its address', () => {
    const note = [
      '---',
      'tags: trip',
      '---',
      'Go by train.',
      '![](https://example.com/a.png)',
      '<img src=https://example.com/b.png alt=b>',
      "<IMG SRC='https://example.com/c.png'/>",
      '<img src="javascript:alert(1)">',
      '![[Inner note]]',
    ].join('\n');
    assert.equal(
      embeddedMarkdown(note),
      [
        'Go by train.',
        '[https://example.com/a.png](https://example.com/a.png)',
        '[https://example.com/b.png](https://example.com/b.png)',
        '[https://example.com/c.png](https://example.com/c.png)',
        '&lt;img src="javascript:alert(1)">',
        '[[Inner note]]',
      ].join('\n'),
    );
  });

  test('a heading embedded is that section alone: its heading down to the next of its level or higher', () => {
    const note = ['# A', 'one', '## B', 'two', '```', '# not a heading', '```', '### C', 'three', '## D', 'four'].join(
      '\n',
    );
    assert.equal(
      embeddedMarkdown(note, 'B'),
      ['## B', 'two', '```', '# not a heading', '```', '### C', 'three'].join('\n'),
    );
    assert.equal(
      embeddedMarkdown(note, 'b '),
      embeddedMarkdown(note, 'B'),
      'found as Obsidian finds one: case and ends aside',
    );
    assert.equal(embeddedMarkdown(note, 'D'), '## D\nfour', 'the last runs to the end');
    assert.equal(embeddedMarkdown(note, 'A#B'), embeddedMarkdown(note, 'B'), 'a nested heading by its last part');
    assert.equal(embeddedMarkdown(note, 'Nowhere'), embeddedMarkdown(note), 'no such heading: the whole note');
  });
});
