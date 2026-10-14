// What an export does with each animated image (editor spec §16, export_animation_stated; §18; §11): the pictures on boxes
// are embedded in the file itself, so the SVG stays self-contained and loads nothing; an SVG keeps an animated image
// moving where the limits allow, with its first frame shown instead under reduced motion by the image's own style sheet,
// scoped under its class (motion_reduced_respected); a PNG, which cannot move, reduces each to its first frame; one past
// a limit is reduced too; and the export says, for each animated image, which it did.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { exportWithLayout } from '../src/export.ts';
import { IMAGE_CLASS } from '../src/export-motion.ts';
import { exportScope } from '../src/export-scope.ts';
import { imageFacts } from '../src/image-facts.ts';
import { PALETTES } from '../src/palette.ts';
import { PICTURE_MARK } from '../src/picture.ts';
import { chosen, directions } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { gif, png } from './image-bytes.js';

const engine = await loadEngine();

const PETS = `// graph: pets
(tom:Cat {name: 'Tom', photo: '[[tom.gif]]'}),
(kit:Cat {name: 'Kit', photo: '[[kit.png]]'}),
(rex:Dog {name: 'Rex', photo: '[[rex.gif]]'}),
(tom)-[:CHASES]->(rex)`;
const STYLE =
  "// graph: pets_style · STYLE pets\n(p1:Picture {property: 'photo', kind: 'Cat'}),\n(p2:Picture {property: 'photo', kind: 'Dog'})";

const layout = async (d, theme) => {
  const laid = directions(d);
  return chosen(
    laid,
    laid.map((x) => engine.render(x.dot)),
    theme === 'dark' ? PALETTES.dark : PALETTES.light,
  );
};

const base64 = (bytes) => Buffer.from(bytes).toString('base64');
const MB = 1024 * 1024;

/** The images the vault holds, as a host loads them: tom moves, kit is still, rex moves but is too large. */
const FILES = {
  'tom.gif': { bytes: gif({ frames: 6 }) },
  'kit.png': { bytes: png() },
  'rex.gif': { bytes: gif({ frames: 4 }), size: 9 * MB },
};
const STILL = base64(png({ width: 1, height: 1 }));

/** A host's loader: each image's bytes, facts and size, and its first frame drawn as a PNG. */
async function load(value) {
  const name = /\[\[(.*)\]\]/.exec(value)[1],
    f = FILES[name];
  if (!f) return { why: `${name} is not in the vault` };
  return {
    name,
    mime: name.endsWith('.gif') ? 'image/gif' : 'image/png',
    base64: base64(f.bytes),
    size: f.size ?? f.bytes.length,
    facts: imageFacts(f.bytes),
    still: STILL,
  };
}

async function exported(format, blocks = [PETS, STYLE], pictures = load) {
  const reading = readNote(blocks),
    scope = exportScope(reading, { graph: 'pets' });
  const { style } = readStyle(blocks, 'pets', reading);
  return exportWithLayout(scope, layout, {
    note: 'Pets.md',
    date: '2026-10-14',
    theme: 'light',
    motion: format === 'svg',
    style,
    data: reading.world.pets,
    ...(pictures ? { pictures } : {}),
  });
}

describe('an exported SVG', () => {
  // proves: export_animation_stated, animated_image_shown
  test('embeds each picture in the file, keeps a moving one moving, and says what it did with each', async () => {
    const image = await exported('svg');
    assert.doesNotMatch(image.svg, new RegExp(PICTURE_MARK), 'every square kept for a picture is filled');
    assert.ok(image.svg.includes(`href="data:image/gif;base64,${base64(FILES['tom.gif'].bytes)}"`), 'tom.gif itself');
    assert.doesNotMatch(image.svg, /href="(?!data:)/, 'nothing is loaded from elsewhere');
    assert.deepEqual(image.animation, [
      'Tom: tom.gif kept moving, and still under reduced motion',
      'Rex: rex.gif reduced to its first frame, as it is 9 MB, over the 5 MB an animated image may be',
    ]);
    assert.match(image.svg, /Animated images: Tom: tom\.gif kept moving/, 'the image says it too');
    assert.ok(!image.animation.some((s) => s.includes('kit.png')), 'a still image needs nothing said');
  });

  // proves: motion_reduced_respected
  test('shows the first frame instead under reduced motion, by its own style sheet scoped under its class', async () => {
    const { svg } = await exported('svg');
    assert.match(svg, /<image class="graph-note-picture-moving"/);
    assert.match(svg, /<image class="graph-note-picture-still"[^>]*href="data:image\/png;base64,/);
    const css = /<style>([\s\S]*?)<\/style>/.exec(svg)[1];
    assert.match(css, new RegExp(`\\.${IMAGE_CLASS} \\.graph-note-picture-still \\{ display: none; \\}`));
    assert.match(
      css,
      new RegExp(
        `@media \\(prefers-reduced-motion: reduce\\) \\{ \\.${IMAGE_CLASS} \\.graph-note-picture-moving \\{ display: none; \\} \\.${IMAGE_CLASS} \\.graph-note-picture-still \\{ display: inline; \\} \\}`,
      ),
    );
    for (const rule of css.split('\n').filter((l) => l && !l.startsWith('@keyframes')))
      assert.ok(rule.includes(`.${IMAGE_CLASS} `), `scoped: ${rule}`);
  });
});

describe('an exported PNG', () => {
  // proves: export_animation_stated
  test('reduces every animated image to its first frame, as a PNG cannot move, and says so', async () => {
    const image = await exported('png');
    assert.doesNotMatch(image.svg, /graph-note-picture-moving/);
    assert.deepEqual(image.animation, [
      'Tom: tom.gif reduced to its first frame, as a PNG cannot move',
      'Rex: rex.gif reduced to its first frame, as a PNG cannot move',
    ]);
  });
});

describe('a picture that cannot be drawn', () => {
  // proves: export_animation_stated
  test('is a dashed frame, and the export says why', async () => {
    const image = await exported('svg', [PETS, STYLE], async (value) =>
      value.includes('tom') ? { why: 'tom.gif is not in the vault' } : load(value),
    );
    assert.match(image.svg, /<rect class="graph-note-picture-missing"[^>]*stroke-dasharray/);
    assert.equal(image.animation[0], 'Tom: not drawn, as tom.gif is not in the vault');
  });

  // proves: animated_image_shown
  test('with no loader, each is a frame and nothing is said', async () => {
    const image = await exported('svg', [PETS, STYLE], null);
    assert.equal((image.svg.match(/graph-note-picture-missing/g) ?? []).length, 3);
    assert.equal(image.animation, undefined);
  });
});
