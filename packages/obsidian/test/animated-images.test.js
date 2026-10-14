// Animated images (editor spec §18, §11, §16): a thing's image, a GIF, APNG, animated WebP or animated SVG attached in the
// vault, is shown in its details and, where its style asks, as a picture on its box (animated_image_shown); every one
// has a pause and play control, reachable from the keyboard and by touch (animation_pause_play); under reduced motion it
// starts still, its first frame, and moves only when played (motion_reduced_respected); past the stated limits of size
// and count it is shown as its first frame, saying why, and playing it is refused with the reason
// (animated_image_limited); and an export says what it did with each (export_animation_stated). Images come only from
// the vault: an address outside it is never loaded. The browser's own decoding draws them; the first frame is drawn by
// the plugin's `stillFrame`, which a test stands in for, as it does `rasterise`.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { gif, png, svg, webp } from '../../core/test/image-bytes.js';

before(() => build());

const PATH = 'Some note.md';
const MB = 1024 * 1024;
const PETS = `// graph: pets
(tom:Cat {name: 'Tom', photo: '[[tom.gif]]'}),
(kit:Cat {name: 'Kit', photo: '[[kit.png]]'}),
(ann:Pet {name: 'Ann', photo: '[[spin.png]]', badge: '[[dance.webp]]', icon: '[[loop.svg]]'}),
(rex:Dog {name: 'Rex', photo: '[[big.gif]]', site: 'https://x.org/rex.gif'}),
(tom)-[:CHASES]->(rex)`;
const STYLE = "// graph: pets_style · STYLE pets\n(p1:Picture {property: 'photo', kind: 'Cat'})";
const noteOf = (...blocks) => ['# Pets', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');

/** big.gif: an animated GIF over the size limit, its frames first and the rest of its 6 MB after. */
const big = () => {
  const b = new Uint8Array(6 * MB);
  b.set(gif({ frames: 3 }));
  return b;
};
const FILES = {
  'tom.gif': gif({ frames: 6 }),
  'kit.png': png(),
  'Attachments/spin.png': png({ frames: 4 }),
  'dance.webp': webp({ frames: 3 }),
  'loop.svg': svg({ moves: true }),
  'big.gif': big(),
};
const STILL = png({ width: 1, height: 1 });

/** The note drawn, its images in the vault, the first frame drawn by a stand-in; with `reduce`, reduced motion on. */
async function drawn(note = noteOf(PETS, STYLE), options = {}) {
  const env = await load({ files: { [PATH]: note, ...(options.files ?? FILES) } });
  env.plugin.stillFrame = async () => STILL;
  if (options.reduce)
    env.doc.defaultView.matchMedia = (q) => ({ media: q, matches: q === '(prefers-reduced-motion: reduce)' });
  const { el } = await show(env, note);
  return { env, el };
}

const box = (el, key) => el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === key);
const pictureOf = (el, key) => box(el, key)?.querySelector('image.graph-note-picture') ?? null;
const controlOf = (el, key) => box(el, key)?.querySelector('.graph-note-image-control') ?? null;
const titleOf = (g) => g.querySelector('title')?.textContent ?? '';
const figures = (el) => el.querySelectorAll('.graph-note-details figure.graph-note-image');
const figure = (el, name) => figures(el).find((f) => f.querySelector('figcaption').textContent.endsWith(name));

/** Opens a thing's details from the keyboard, and waits for its images. */
async function details(el, key, count) {
  box(el, key).dispatch('keydown', { key: 'Enter' });
  await until(() => figures(el).length === count && figures(el).every((f) => f.getAttribute('data-ready') === 'true'));
}

describe('an animated image is shown', () => {
  // proves: animated_image_shown
  test("in a thing's details: a GIF, an APNG, an animated WebP and an animated SVG, each moving with a control", async () => {
    const { env, el } = await drawn();
    try {
      await details(el, 'ann', 3);
      for (const name of ['spin.png', 'dance.webp', 'loop.svg']) {
        const f = figure(el, name);
        const img = f.querySelector('img');
        assert.match(img.getAttribute('src'), /^blob:/, `${name} is drawn from the vault's bytes`);
        assert.ok(img.classList.contains('graph-note-image-moving'), `${name} moves`);
        assert.equal(labelled(f, `Pause ${name}`).localName, 'button');
      }
      assert.equal(figure(el, 'loop.svg').querySelector('figcaption').textContent, 'icon: loop.svg');
      await details(el, 'kit', 1);
      const still = figure(el, 'kit.png');
      assert.ok(!still.querySelector('.graph-note-image-control'), 'an image that does not move has no control');
      assert.ok(still.querySelector('img').classList.contains('graph-note-image-plain'));
    } finally {
      env.uninstall();
    }
  });

  // proves: animated_image_shown
  test('on its box, where its style asks: in the room kept for it, and on no other box', async () => {
    const { env, el } = await drawn();
    try {
      await until(() => pictureOf(el, 'tom') && pictureOf(el, 'kit'));
      assert.match(pictureOf(el, 'tom').getAttribute('href'), /^blob:/);
      assert.ok(pictureOf(el, 'tom').classList.contains('graph-note-image-moving'));
      assert.equal(controlOf(el, 'tom').getAttribute('aria-label'), 'Pause tom.gif');
      assert.equal(controlOf(el, 'kit'), null, 'a still picture has no control');
      assert.equal(pictureOf(el, 'rex'), null, 'no Picture asks for a dog');
      assert.ok(
        !el.querySelectorAll('polygon').some((p) => p.getAttribute('fill') === '#0005fe'),
        'the marked square is filled',
      );
    } finally {
      env.uninstall();
    }
  });

  // proves: animated_image_shown
  test('only from the vault: an address outside it is never loaded, and says so', async () => {
    const { env, el } = await drawn();
    try {
      await details(el, 'rex', 2);
      const remote = figure(el, 'https://x.org/rex.gif');
      assert.equal(remote.querySelector('img'), null, 'nothing is loaded');
      assert.match(remote.textContent, /is outside the vault, and an image from outside the vault is not loaded/);
    } finally {
      env.uninstall();
    }
  });
});

describe('pause and play', () => {
  // proves: animation_pause_play
  test('the picture on a box: reached by Tab, paused and played by Enter or Space, never opening the details', async () => {
    const { env, el } = await drawn();
    try {
      await until(() => controlOf(el, 'tom'));
      const control = controlOf(el, 'tom'),
        picture = pictureOf(el, 'tom');
      assert.equal(control.getAttribute('tabindex'), '0');
      assert.equal(control.getAttribute('role'), 'button');
      const moving = picture.getAttribute('href');
      control.dispatch('keydown', { key: 'Enter' });
      await until(() => control.getAttribute('aria-label') === 'Play tom.gif');
      assert.notEqual(picture.getAttribute('href'), moving, 'paused: its first frame');
      assert.ok(picture.classList.contains('graph-note-image-still'));
      control.dispatch('keydown', { key: ' ' });
      await until(() => control.getAttribute('aria-label') === 'Pause tom.gif');
      assert.equal(picture.getAttribute('href'), moving);
      assert.ok(el.querySelector('.graph-note-details').hidden, 'the keys worked the control, not the box');
    } finally {
      env.uninstall();
    }
  });

  // proves: animation_pause_play
  test('by touch: a tap on the control pauses it, and is never a tap on the drawing', async () => {
    const { env, el } = await drawn();
    try {
      await until(() => controlOf(el, 'tom'));
      const control = controlOf(el, 'tom'),
        vp = el.querySelector('.graph-note-viewport');
      const at = { target: control, pointerId: 4, pointerType: 'touch', clientX: 30, clientY: 30, button: 0 };
      vp.dispatch('pointerdown', at);
      vp.dispatch('pointerup', at);
      control.click();
      await until(() => control.getAttribute('aria-label') === 'Play tom.gif');
      assert.ok(el.querySelector('.graph-note-details').hidden, 'the box was not opened');
      assert.ok(!box(el, 'tom').classList.contains('is-selected'));
    } finally {
      env.uninstall();
    }
  });

  // proves: animation_pause_play
  test('in the details: a button, which the keyboard and a tap both press', async () => {
    const { env, el } = await drawn();
    try {
      await details(el, 'tom', 1);
      const f = figure(el, 'tom.gif');
      labelled(f, 'Pause tom.gif').click();
      await until(() => labelled(f, 'Play tom.gif'));
      assert.ok(f.querySelector('img').classList.contains('graph-note-image-still'));
      labelled(f, 'Play tom.gif').click();
      await until(() => labelled(f, 'Pause tom.gif'));
    } finally {
      env.uninstall();
    }
  });
});

describe('under reduced motion', () => {
  // proves: motion_reduced_respected
  test('every animated image starts still, its first frame, and moves only when the user plays it', async () => {
    const { env, el } = await drawn(undefined, { reduce: true });
    try {
      await until(() => controlOf(el, 'tom'));
      const control = controlOf(el, 'tom');
      assert.equal(control.getAttribute('aria-label'), 'Play tom.gif');
      assert.ok(pictureOf(el, 'tom').classList.contains('graph-note-image-still'));
      assert.equal(titleOf(control), 'Still, as the system asks for reduced motion. Press Play to move it.');
      await details(el, 'ann', 3);
      for (const name of ['spin.png', 'dance.webp', 'loop.svg'])
        assert.ok(labelled(figure(el, name), `Play ${name}`), `${name} starts still`);
      control.dispatch('keydown', { key: 'Enter' });
      await until(() => control.getAttribute('aria-label') === 'Pause tom.gif');
      assert.ok(pictureOf(el, 'tom').classList.contains('graph-note-image-moving'));
    } finally {
      env.uninstall();
    }
  });
});

describe('past the limits', () => {
  // proves: animated_image_limited
  test('one larger than the size limit is its first frame, saying why and the limits, and Play is refused', async () => {
    const { env, el } = await drawn();
    try {
      await details(el, 'rex', 2);
      const f = figure(el, 'big.gif');
      assert.ok(f.querySelector('img').classList.contains('graph-note-image-still'));
      const said = f.querySelector('[role="status"]');
      assert.match(said.textContent, /^Shown as its first frame: it is 6 MB, over the 5 MB an animated image may be\./);
      assert.match(said.textContent, /An animated image moves when it is at most 5 MB/);
      const play = labelled(f, 'Play big.gif');
      assert.equal(play.getAttribute('aria-disabled'), 'true');
      play.click();
      await until(() => said.getAttribute('data-refused') === 'true');
      assert.ok(f.querySelector('img').classList.contains('graph-note-image-still'), 'still, whatever is pressed');
    } finally {
      env.uninstall();
    }
  });

  // proves: animated_image_limited
  test('past the count moving at once: the rest wait still, and play once another is paused', async () => {
    const cats = Array.from({ length: 7 }, (_, i) => `(c${i}:Cat {name: 'Cat ${i}', photo: '[[c${i}.gif]]'})`);
    const files = Object.fromEntries(cats.map((_, i) => [`c${i}.gif`, gif({ frames: 2 })]));
    const note = noteOf(`// graph: pets\n${cats.join(',\n')}`, STYLE);
    const { env, el } = await drawn(note, { files });
    try {
      await until(() => cats.every((_, i) => controlOf(el, `c${i}`)));
      const labels = cats.map((_, i) => controlOf(el, `c${i}`).getAttribute('aria-label'));
      assert.equal(labels.filter((l) => l.startsWith('Pause')).length, 6);
      const waiting = cats.findIndex((_, i) => labels[i].startsWith('Play'));
      const held = controlOf(el, `c${waiting}`);
      assert.match(titleOf(held), /6 animated images are already moving here\. Pause one of them to play this one\./);
      held.dispatch('keydown', { key: 'Enter' });
      await until(() => held.getAttribute('data-refused') === 'true');
      assert.equal(held.getAttribute('aria-label'), `Play c${waiting}.gif`);
      const first = controlOf(el, `c${waiting === 0 ? 1 : 0}`);
      first.dispatch('keydown', { key: 'Enter' });
      await until(() => first.getAttribute('aria-label').startsWith('Play'));
      held.dispatch('keydown', { key: 'Enter' });
      await until(() => held.getAttribute('aria-label') === `Pause c${waiting}.gif`);
    } finally {
      env.uninstall();
    }
  });
});

describe('an export', () => {
  /** Exports the drawing as `format` from its Export form, and gives the notice it said. */
  async function exported(env, el, format) {
    labelled(el, 'Export').click();
    const form = el.querySelector('.graph-note-export');
    const sel = form.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === 'Format');
    sel.value = format;
    sel.dispatch('change');
    env.state.notices.length = 0;
    labelled(form, 'Export it').click();
    await until(() => env.state.notices.length > 0, 10000);
    return env.state.notices.at(-1);
  }

  // proves: export_animation_stated
  test('as SVG keeps each animated image moving, embedded in the file, and says so', async () => {
    const { env, el } = await drawn();
    try {
      const said = await exported(env, el, 'svg');
      assert.match(said, /^Exported /);
      assert.match(said, /Animated images: Tom: tom\.gif kept moving, and still under reduced motion\./);
      const file = [...env.state.files.keys()].find((p) => p.startsWith('Some-note-pets-') && p.endsWith('.svg'));
      const held = env.state.files.get(file),
        text = typeof held === 'string' ? held : new TextDecoder().decode(held);
      assert.ok(text.includes(`href="data:image/gif;base64,${Buffer.from(FILES['tom.gif']).toString('base64')}"`));
      assert.match(text, /@media \(prefers-reduced-motion: reduce\) \{ \.graph-note-image \.graph-note-picture-moving/);
    } finally {
      env.uninstall();
    }
  });

  // proves: export_animation_stated
  test('as PNG reduces each animated image to its first frame, and says so', async () => {
    const { env, el } = await drawn();
    try {
      env.plugin.rasterise = async () => new Uint8Array([137, 80, 78, 71]);
      const said = await exported(env, el, 'png');
      assert.match(said, /Animated images: Tom: tom\.gif reduced to its first frame, as a PNG cannot move\./);
    } finally {
      env.uninstall();
    }
  });
});
