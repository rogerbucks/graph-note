// A picture on a box (editor spec §18, animated_image_shown): where its style asks, a thing's image is drawn on its
// box. A Picture in the style graph names the property that holds the image. It does so for a kind's things or one
// thing, in the whole graph or a view. The most particular Picture for a box decides. The layout source keeps room for
// it, a fixed cell at the top of the box marked by its colour. The host fills that cell with the image (the drawing),
// or the export embeds it in it. Spans picture.ts (the choice and the source), style-checks.ts (the words checked) and
// style-source.ts and render.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { PICTURE_MARK, PICTURE_SIZE, pictureSource, picturesFor } from '../src/picture.ts';
import { directions, draw } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';

const engine = await loadEngine();

const PETS = `// graph: pets
(tom:Cat {name: 'Tom', photo: '[[tom.gif]]', badge: '[[star.png]]'}),
(kit:Cat {name: 'Kit', photo: 'Attachments/kit.webp'}),
(rex:Dog {name: 'Rex', photo: '[[rex.gif]]'}),
(tom)-[:CHASES]->(rex)`;

const textsWith = (...lines) => [PETS, ['// graph: pets_style · STYLE pets', ...lines].join('\n')];

/** The drawing of pets as its style draws it in `view` (none: the whole graph), and the style's problems. */
function styled(lines, view) {
  const texts = textsWith(...lines),
    reading = readNote(texts),
    { style, problems } = readStyle(texts, 'pets', reading);
  const drawing = styledDrawing(reading.graphs.get('pets'), style, reading.world.pets, view);
  return { drawing, problems: problems.map((p) => [p.line, p.message, p.fix]), style };
}

describe('a Picture in the style graph', () => {
  // proves: animated_image_shown
  test("draws each thing of a kind with the image its property names, and no other thing's", () => {
    const { drawing, problems } = styled(["(p1:Picture {property: 'photo', kind: 'Cat'})"]);
    assert.deepEqual(problems, []);
    assert.deepEqual(drawing.pictures, [
      { index: 0, key: 'tom', property: 'photo', value: '[[tom.gif]]' },
      { index: 1, key: 'kit', property: 'photo', value: 'Attachments/kit.webp' },
    ]);
  });

  // proves: animated_image_shown
  test('for one thing over its kind, and in a view over the whole graph', () => {
    const lines = [
      "(p1:Picture {property: 'photo', kind: 'Cat'}),",
      "(p2:Picture {property: 'badge', thing: 'tom'}),",
      "(p3:Picture {property: 'photo', thing: 'rex', view: 'dogs'})",
    ];
    assert.deepEqual(
      styled(lines).drawing.pictures.map((p) => [p.key, p.property]),
      [
        ['tom', 'badge'],
        ['kit', 'photo'],
      ],
    );
    assert.deepEqual(
      styled(lines, 'dogs').drawing.pictures.map((p) => [p.key, p.property]),
      [
        ['tom', 'badge'],
        ['kit', 'photo'],
        ['rex', 'photo'],
      ],
    );
  });

  // proves: animated_image_shown
  test('with no Picture, nothing is drawn on a box, and the source is as it was', () => {
    const { drawing } = styled([]);
    assert.equal(drawing.pictures, undefined);
    const dot = directions(drawing)[0].dot;
    assert.equal(pictureSource(dot, []), dot);
    assert.doesNotMatch(dot, new RegExp(PICTURE_MARK));
  });

  // proves: animated_image_shown
  test('is checked: it names a property, of one kind or one thing, that the graph has', () => {
    const { problems } = styled([
      "(p1:Picture {kind: 'Cat'}),",
      "(p2:Picture {property: 'photo', kind: 'Cat', thing: 'tom'}),",
      "(p3:Picture {property: 'photo'}),",
      "(p4:Picture {property: 'photo', kind: 'Kat'}),",
      "(p5:Picture {property: 'phot', kind: 'Cat'}),",
      "(p6:Picture {property: 'photo', kind: 'Cat', size: 'big'})",
    ]);
    assert.deepEqual(problems, [
      [2, 'a Picture names the property that holds its image', "add property: '<name>'"],
      [3, 'a Picture is for one kind or one thing', 'remove one of them'],
      [4, 'a Picture is for one kind or one thing', "add kind: '<Kind>' or thing: '<id>'"],
      [5, 'Kat is not a kind in graph pets', 'change Kat to Cat'],
      [6, 'phot is not a property of Cat in graph pets', 'change phot to photo'],
      [7, 'size is not a key a Picture uses', 'remove size, or use one of property, kind, thing or view'],
    ]);
  });
});

describe('the room a picture is drawn in', () => {
  // proves: animated_image_shown
  test('is a fixed cell at the top of the box, marked by its colour, in every direction laid out', () => {
    const { drawing } = styled(["(p1:Picture {property: 'photo', kind: 'Cat'})"]);
    const cell = `<tr><td fixedsize="true" width="${PICTURE_SIZE}" height="${PICTURE_SIZE}" bgcolor="${PICTURE_MARK}"></td></tr>`;
    for (const { dot } of directions(drawing)) {
      const tom = dot.split('\n').find((l) => l.startsWith('  "tom" [label=<<table '));
      assert.ok(tom.includes(`cellpadding="0">${cell}`), tom);
      const rex = dot.split('\n').find((l) => l.startsWith('  "rex" [label=<<table '));
      assert.ok(!rex.includes(PICTURE_MARK), 'a dog has no picture');
    }
  });

  // proves: animated_image_shown
  test('is drawn by Graphviz as one marked square in the box, the size asked for', () => {
    const { drawing } = styled(["(p1:Picture {property: 'photo', thing: 'tom'})"]);
    const svg = draw(drawing, engine).svg;
    const squares = [...svg.matchAll(new RegExp(`<polygon fill="${PICTURE_MARK}"[^>]*points="([^"]*)"`, 'g'))];
    assert.equal(squares.length, 1);
    const xs = squares[0][1].split(' ').map((p) => Number(p.split(',')[0]));
    assert.equal(Math.max(...xs) - Math.min(...xs), PICTURE_SIZE);
  });

  // proves: animated_image_shown
  test('is kept for a value that is text, whatever it names; a value that is not text draws none', () => {
    const texts = [
      "// graph: g\n(a:Cat {name: 'A', photo: 'https://x.org/a.gif'}),\n(b:Cat {name: 'B', photo: 42})",
      "// graph: g_style · STYLE g\n(p1:Picture {property: 'photo', kind: 'Cat'})",
    ];
    const reading = readNote(texts);
    const { style } = readStyle(texts, 'g', reading);
    assert.deepEqual(picturesFor(reading.graphs.get('g'), reading.world.g, style), [
      { index: 0, key: 'a', property: 'photo', value: 'https://x.org/a.gif' },
    ]);
  });
});
