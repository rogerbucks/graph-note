// Export in Obsidian (editor spec §16): an Export button on a drawing exports the whole diagram, or, on a view, the view
// or the view with its faded context (export_two_scopes, view_export_stays_view); as SVG or PNG (export_formats), the
// PNG at twice natural size or more (export_png_sharp), in fixed light or dark colours (export_fixed_theme), carrying
// its title, legend, note and date (export_self_explaining); saved into the vault with a companion note when set
// (export_companion_note); nothing written for an empty graph (empty_export), nor a half-written file when the write
// fails (failed_export); and a note above the configured classification named, and asked about first (classified_export).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

// the note the test host's drawings come from
const PATH = 'Some note.md';
const DATA = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park), (park)-[:NEAR]->(cafe), (cafe)-[:NEAR]->(lake)`;
const VIEW = "// graph: trip · QUERY view round_park\nMATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m";
const noteOf = (...blocks) => ['# Trip', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const written = (env, ext) => [...env.state.files.keys()].filter((p) => p.endsWith(ext));

/** Shows block `n` of the note in the vault at PATH, and opens its Export form. */
async function exporting(env, n = 0) {
  const { el } = await show(env, env.state.files.get(PATH), n);
  labelled(el, 'Export').click();
  const form = el.querySelector('.graph-note-export');
  assert.ok(form, 'the Export form');
  const choose = (label, value) => {
    const sel = form.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === label);
    sel.value = value;
    sel.dispatch('change');
  };
  return { el, form, choose, go: () => labelled(form, 'Export it').click() };
}

async function loaded(note = noteOf(DATA), data = null) {
  const env = await load({ files: { [PATH]: note }, ...(data ? { data } : {}) });
  env.state.notices.length = 0;
  return env;
}

describe('the Export button', () => {
  test('exports the whole diagram as SVG into the vault: fixed colours, its title, legend, note and date', async () => {
    const env = await loaded();
    try {
      const { go } = await exporting(env);
      go();
      await until(() => written(env, '.svg').length === 1);
      const [path] = written(env, '.svg');
      assert.match(path, /^Some-note-trip-\d{4}-\d\d-\d\d\.svg$/);
      const svg = env.state.files.get(path);
      assert.doesNotMatch(svg, /var\(--|color-mix\(/, 'theme colours fixed');
      assert.match(svg, />trip</, 'its title');
      assert.match(svg, /Some note\.md/, 'the note it came from');
      assert.match(svg, /\d{1,2} [A-Z][a-z]{2} \d{4}/, 'the date');
      assert.match(svg, /Place/, 'the legend names the kinds');
      assert.match(env.state.notices.at(-1), /Exported/);
    } finally {
      env.uninstall();
    }
  });

  test('a view exports only what is in the view, unless its faded context is asked for', async () => {
    const env = await loaded(noteOf(DATA, VIEW));
    try {
      const a = await exporting(env, 1);
      a.choose('What to export', 'view');
      a.go();
      await until(() => written(env, '.svg').length === 1);
      const only = env.state.files.get(written(env, '.svg')[0]);
      assert.doesNotMatch(only, />The lake</, 'the view holds what is one step from the park, never the lake');
      assert.match(only, />The park</);
      const b = await exporting(env, 1);
      b.choose('What to export', 'context');
      b.go();
      await until(() => written(env, '.svg').length === 2);
      const withContext = env.state.files.get(written(env, '.svg').find((p) => p.includes('with-context')));
      assert.match(withContext, />The lake</, 'the faded context, when asked for');
    } finally {
      env.uninstall();
    }
  });

  test('offers SVG and PNG; a PNG is drawn at twice natural size or more', async () => {
    const env = await loaded();
    try {
      const asked = [];
      env.plugin.rasterise = async (svg, size) => {
        asked.push(size);
        return new Uint8Array([137, 80, 78, 71]);
      };
      const { form, choose, go } = await exporting(env);
      assert.deepEqual(
        form
          .querySelectorAll('select')
          .find((s) => s.getAttribute('aria-label') === 'Format')
          .querySelectorAll('option')
          .map((o) => o.getAttribute('value')),
        ['svg', 'png'],
      );
      choose('Format', 'png');
      go();
      await until(() => written(env, '.png').length === 1);
      assert.ok(asked[0].scale >= 2);
    } finally {
      env.uninstall();
    }
  });

  test('dark, as chosen: the image is drawn in the fixed dark colours', async () => {
    const env = await loaded();
    try {
      const { choose, go } = await exporting(env);
      choose('Theme', 'dark');
      go();
      await until(() => written(env, '.svg').length === 1);
      const svg = env.state.files.get(written(env, '.svg')[0]);
      const light = await (async () => {
        const e2 = await loaded();
        const x = await exporting(e2);
        x.go();
        await until(() => written(e2, '.svg').length === 1);
        const s = e2.state.files.get(written(e2, '.svg')[0]);
        e2.uninstall();
        return s;
      })();
      assert.notEqual(svg, light);
    } finally {
      env.uninstall();
    }
  });

  test('saved into the vault, it gets a companion note when the settings say so', async () => {
    const env = await loaded(noteOf(DATA), { settings: { companionNote: 'on' } });
    try {
      (await exporting(env)).go();
      await until(() => written(env, '.svg').length === 1);
      const image = written(env, '.svg')[0];
      const companion = image.replace(/\.svg$/, '.md');
      assert.match(env.state.files.get(companion), new RegExp(`!\\[\\[${image.replace(/[.]/g, '\\.')}\\]\\]`));
      assert.match(env.state.files.get(companion), /\[\[Some note(\.md)?\]\]/);
    } finally {
      env.uninstall();
    }
  });
});

describe('when an export cannot go ahead', () => {
  test('an empty graph says there is nothing to export, and writes no file', async () => {
    const env = await loaded(noteOf('// graph: trip'));
    try {
      await env.plugin.exportGraph({ path: PATH, graph: 'trip', format: 'svg', theme: 'light' });
      assert.match(env.state.notices.at(-1), /nothing to export/i);
      assert.deepEqual(written(env, '.svg'), []);
    } finally {
      env.uninstall();
    }
  });

  test('a write that fails says why and leaves no half-written file', async () => {
    const env = await loaded();
    try {
      env.state.failWrite = 'Some-note-trip';
      (await exporting(env)).go();
      await until(() => /could not|disk is full/i.test(env.state.notices.at(-1) ?? ''));
      assert.match(env.state.notices.at(-1), /disk is full/);
      assert.deepEqual(
        [...env.state.files.keys()].filter((p) => p !== PATH),
        [],
      );
    } finally {
      env.uninstall();
    }
  });

  test('a note above the configured classification is named, and nothing is written until the person says so', async () => {
    const note = `---\nclassification: Internal\n---\n${noteOf(DATA)}`;
    const env = await loaded(note);
    try {
      const { form, go } = await exporting(env);
      go();
      await until(() => !!labelled(form, 'Export anyway'));
      assert.match(form.textContent, /Internal/);
      assert.deepEqual(written(env, '.svg'), []);
      labelled(form, 'Export anyway').click();
      await until(() => written(env, '.svg').length === 1);
    } finally {
      env.uninstall();
    }
  });
});
