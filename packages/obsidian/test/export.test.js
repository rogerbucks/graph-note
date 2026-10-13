// Export in Obsidian (editor spec §16): an Export button on a drawing exports the whole diagram, or, on a view, the view
// or the view with its faded context (export_two_scopes, view_export_stays_view); as SVG or PNG (export_formats), the
// PNG at twice natural size or more (export_png_sharp), in fixed light or dark colours (export_fixed_theme), carrying
// its title, legend, note and date (export_self_explaining); saved into the vault with a companion note when set
// (export_companion_note); nothing written for an empty graph (empty_export), nor a half-written file when the write
// fails (failed_export); and a note above the configured classification named, and asked about first (classified_export).
// The data is offered too, as a GQL block, CSV and GraphML (export_data_formats), each reading back into the things and
// links exported, a view's alone, however large the graph (export_lossless); and a PNG too large for one sharp image
// is split across pages, all of them written or none (big_export).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { dataOf, readBack } from '../../core/test/export-data-readers.js';
import { readNote } from '../../core/src/drawing.ts';
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
        ['svg', 'png', 'gql', 'csv', 'graphml'],
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

/** The things and links of the trip graph as read, kept to the things `keep` names and the links between them. */
function tripData(keep = () => true) {
  const { things, links } = dataOf(readNote([DATA]).world.trip);
  const kept = things.filter(([id]) => keep(id)),
    ids = new Set(kept.map(([id]) => id));
  return { things: kept, links: links.filter(([from, , to]) => ids.has(from) && ids.has(to)) };
}

describe('the data', () => {
  test('is exported as a GQL block, as CSV and as GraphML, each reading back into the graph’s things and links', async () => {
    const env = await loaded();
    try {
      for (const format of ['gql', 'csv', 'graphml']) {
        const { choose, go } = await exporting(env);
        choose('Format', format);
        go();
        await until(() => written(env, `.${format}`).length === 1);
        const [path] = written(env, `.${format}`);
        assert.match(path, new RegExp(`^Some-note-trip-\\d{4}-\\d\\d-\\d\\d\\.${format}$`));
        assert.deepEqual(readBack(format, env.state.files.get(path)), tripData(), format);
        assert.match(env.state.notices.at(-1), /Exported/);
      }
      assert.deepEqual(written(env, '.md'), [PATH], 'no companion note: that is an image’s');
    } finally {
      env.uninstall();
    }
  });

  test('of a view holds only the view’s things and the links between them, even with its faded context chosen', async () => {
    const env = await loaded(noteOf(DATA, VIEW));
    try {
      for (const scope of ['view', 'context']) {
        const { choose, go } = await exporting(env, 1);
        choose('What to export', scope);
        choose('Format', 'csv');
        go();
        await until(() => written(env, '.csv').length === (scope === 'view' ? 1 : 2));
      }
      const want = tripData((id) => ['home', 'park', 'cafe'].includes(id));
      for (const path of written(env, '.csv')) {
        assert.doesNotMatch(path, /with-context/, 'the faded context is a picture’s, never data');
        assert.deepEqual(readBack('csv', env.state.files.get(path)), want);
      }
    } finally {
      env.uninstall();
    }
  });

  test('of a graph too large to draw is still exported whole, with no layout asked for', async () => {
    const env = await loaded();
    try {
      Object.assign(env.plugin.layoutLimits, { things: 2 });
      env.plugin.layoutForExport = () => {
        throw new Error('data is never laid out');
      };
      // a graph over the limits is shown as text, with no bar: the export is asked for as the form asks for it
      const outcome = await env.plugin.exportGraph({ path: PATH, graph: 'trip', format: 'graphml', theme: 'light' });
      assert.ok('done' in outcome, JSON.stringify(outcome));
      assert.deepEqual(readBack('graphml', env.state.files.get(written(env, '.graphml')[0])), tripData());
    } finally {
      env.uninstall();
    }
  });
});

describe('a PNG too large for one sharp image', () => {
  const LIMIT = 180_000;
  const two = (n) => String(n).padStart(2, '0');
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  };
  /** The plugin loaded with `data`, its PNGs held to LIMIT pixels and drawn by a stand-in that keeps each size asked for. */
  async function paged(data) {
    const env = await loaded(noteOf(DATA), data);
    const sizes = [];
    env.plugin.pngPixelLimit = LIMIT;
    env.plugin.rasterise = async (svg, size) => (sizes.push({ svg, size }), new Uint8Array([137, 80, 78, 71]));
    const { choose, go } = await exporting(env);
    choose('Format', 'png');
    return { env, sizes, go };
  }

  test('is split across pages, each within the pixels allowed and at twice natural size, named in order', async () => {
    const { env, sizes, go } = await paged({ settings: { companionNote: 'on' } });
    try {
      go();
      await until(() => /Exported/.test(env.state.notices.at(-1) ?? ''));
      const n = sizes.length;
      assert.ok(n > 1, 'more than one page');
      for (const { size } of sizes) assert.ok(size.scale >= 2 && size.width * size.height <= LIMIT);
      const pages = written(env, '.png').sort(
        (a, b) => Number(/page-(\d+)/.exec(a)[1]) - Number(/page-(\d+)/.exec(b)[1]),
      );
      assert.deepEqual(
        pages,
        Array.from({ length: n }, (_, i) => `Some-note-trip-${today()}-page-${i + 1}-of-${n}.png`),
      );
      const companion = env.state.files.get(`Some-note-trip-${today()}.md`);
      for (const p of pages) assert.ok(companion.includes(`![[${p}]]`), p);
      assert.match(env.state.notices.at(-1), new RegExp(`${n} pages`));
    } finally {
      env.uninstall();
    }
  });

  test('a page that cannot be written leaves none of them: every page written is taken away again', async () => {
    const { env, go } = await paged();
    try {
      env.state.failWrite = `Some-note-trip-${today()}-page-2-`;
      go();
      await until(() => /disk is full/.test(env.state.notices.at(-1) ?? ''));
      assert.deepEqual(written(env, '.png'), []);
      assert.deepEqual(written(env, '.part'), []);
    } finally {
      env.uninstall();
    }
  });
});
