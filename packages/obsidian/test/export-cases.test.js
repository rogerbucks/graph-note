// Export's harder cases (editor spec §16): a classification however the front matter writes it, or before the note is
// indexed (classified_export); the share sheet on a phone, opened by its own tap, and nothing saved when it is cancelled
// (export_share_sheet); an earlier export never overwritten; failures said once, rightly, with no temporary file left
// among the notes (failed_export); a PNG too large for the device refused as such (export_png_sharp); and the
// form taking one press at a time, its focus where the person is (accessibility).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const DATA = "// graph: trip\n(home:Place {name: 'Home'}),\n(park:Place {name: 'The park'}),\n(home)-[:NEAR]->(park)";
const NOTE = ['# Trip', '', fence(DATA), ''].join('\n');
const withFront = (front) => `---\n${front}\n---\n${NOTE}`;
const files = (env, ext) => [...env.state.files.keys()].filter((p) => p.endsWith(ext));

async function form(env) {
  const { el } = await show(env, env.state.files.get(PATH), 0);
  labelled(el, 'Export').click();
  const f = el.querySelector('.graph-note-export');
  return { el, f, go: () => labelled(f, 'Export it').click() };
}
async function loaded(note = NOTE, options = {}) {
  const env = await load({ files: { [PATH]: note }, ...options });
  env.state.notices.length = 0;
  return env;
}

describe('a classification, however it is written', () => {
  for (const [shape, front] of [
    ['a list', 'classification:\n  - Restricted'],
    ['a number', 'classification: 3'],
    ['a capitalised key', 'Classification: Restricted'],
  ])
    test(`${shape} is asked about before anything is written`, async () => {
      const env = await loaded(withFront(front));
      try {
        const { f, go } = await form(env);
        go();
        await until(() => !!labelled(f, 'Export anyway'));
        assert.deepEqual(files(env, '.svg'), []);
      } finally {
        env.uninstall();
      }
    });

  test('a note not yet indexed is read from its own text, and asked about', async () => {
    const env = await loaded(withFront('classification: Restricted'));
    try {
      env.state.noCache = true;
      const { f, go } = await form(env);
      go();
      await until(() => !!labelled(f, 'Export anyway'));
      assert.match(f.textContent, /Restricted/);
    } finally {
      env.uninstall();
    }
  });
});

describe('on a phone', () => {
  test('the image is offered to the share sheet by a tap of its own, and a cancel saves nothing', async () => {
    const env = await loaded(NOTE, { mobile: true });
    try {
      const shared = [];
      env.doc.defaultView.navigator = {
        canShare: () => true,
        share: async (d) => {
          shared.push(d.files[0].name);
          const e = new Error('cancelled');
          e.name = 'AbortError';
          throw e;
        },
      };
      const { f, go } = await form(env);
      go();
      await until(() => !!labelled(f, 'Share'));
      assert.equal(shared.length, 0, 'not before its own tap');
      labelled(f, 'Share').click();
      await until(() => shared.length === 1);
      await wait(20);
      assert.deepEqual(files(env, '.svg'), [], 'cancelled: nothing saved');
      assert.match(f.textContent, /Not shared/);
    } finally {
      env.uninstall();
    }
  });

  test('a phone that cannot share a file saves it into the vault, says so, and writes its companion note as set', async () => {
    const env = await loaded(NOTE, { mobile: true, data: { settings: { companionNote: 'on' } } });
    try {
      env.doc.defaultView.navigator = {};
      (await form(env)).go();
      await until(() => files(env, '.svg').length === 1);
      assert.equal(files(env, '.md').length, 2, 'the note and the companion note');
      assert.match(env.state.notices.at(-1), /saved in the vault/i);
    } finally {
      env.uninstall();
    }
  });
});

describe('writing', () => {
  test('an earlier export of the same name is kept: the new one gets a name of its own, and that is said', async () => {
    const env = await loaded();
    try {
      (await form(env)).go();
      await until(() => files(env, '.svg').length === 1);
      const first = files(env, '.svg')[0];
      const was = env.state.files.get(first);
      (await form(env)).go();
      await until(() => files(env, '.svg').length === 2);
      assert.equal(env.state.files.get(first), was, 'the earlier export untouched');
      assert.ok(files(env, '.svg').some((p) => /-2\.svg$/.test(p)));
      assert.deepEqual(env.state.trashed ?? [], []);
    } finally {
      env.uninstall();
    }
  });

  test('a failure is said once, and no temporary file is left among the notes', async () => {
    const env = await loaded();
    try {
      env.state.failWrite = 'Some-note-trip';
      (await form(env)).go();
      await until(() => /disk is full/.test(env.state.notices.at(-1) ?? ''));
      const said = env.state.notices.at(-1);
      assert.equal((said.match(/could not be written/g) ?? []).length, 1, said);
      assert.deepEqual(files(env, '.part'), []);
      assert.ok(
        (env.state.trashed ?? []).every((p) => p.endsWith('.part')),
        'only the plugin’s own temporary file',
      );
    } finally {
      env.uninstall();
    }
  });

  test('when the companion note fails, the image is said to be saved, and where', async () => {
    const env = await loaded(NOTE, { data: { settings: { companionNote: 'on' } } });
    try {
      const create = env.app.vault.create;
      env.app.vault.create = (path, text) =>
        /Some-note-trip.*\.md/.test(path) ? Promise.reject(new Error('no space left on device')) : create(path, text);
      (await form(env)).go();
      await until(() => /companion note could not be written/.test(env.state.notices.join('\n')));
      const said = env.state.notices.find((n) => /companion/.test(n));
      assert.match(said, /The image was saved at Some-note-trip/);
      assert.doesNotMatch(said, /Nothing was saved/);
    } finally {
      env.uninstall();
    }
  });

  test('a PNG too large for the device is refused as such, and the SVG suggested', async () => {
    const env = await loaded();
    try {
      env.plugin.rasterise = async () => {
        throw new Error('should not be drawn');
      };
      env.plugin.pngPixelLimit = 100;
      const { f, go } = await form(env);
      const sel = f.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === 'Format');
      sel.value = 'png';
      sel.dispatch('change');
      go();
      await until(() => /too large/.test(env.state.notices.at(-1) ?? ''));
      assert.match(env.state.notices.at(-1), /SVG/);
    } finally {
      env.uninstall();
    }
  });
});

describe('the form', () => {
  test('takes one press at a time: a second press while it works writes nothing more', async () => {
    const env = await loaded();
    try {
      const { f } = await form(env);
      const go = labelled(f, 'Export it');
      go.click();
      go.click();
      await until(() => files(env, '.svg').length >= 1);
      await wait(100);
      assert.equal(files(env, '.svg').length, 1);
    } finally {
      env.uninstall();
    }
  });

  test('a question takes the focus to Export anyway', async () => {
    const env = await loaded(withFront('classification: Restricted'));
    try {
      const { f, go } = await form(env);
      go();
      await until(() => !!labelled(f, 'Export anyway'));
      assert.ok(env.doc.activeElement === labelled(f, 'Export anyway'));
    } finally {
      env.uninstall();
    }
  });
});
