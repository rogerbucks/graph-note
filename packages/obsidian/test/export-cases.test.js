// Export's harder cases (editor spec §16): a classification however the front matter writes it, or before the note is
// indexed (classified_export); the share sheet on a phone, opened by its own tap, and nothing saved when it is cancelled
// (export_share_sheet); an earlier export never overwritten; failures said once, rightly, with no temporary file left
// among the notes (failed_export); a PNG too large for the device refused as such (export_png_sharp); and the
// form taking one press at a time, its focus where the person is (accessibility).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import { STYLE } from '../../core/src/layout.ts';
import { PALETTES } from '../../core/src/palette.ts';
import { hueColour } from '../../core/src/theme.ts';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { installWorkers } from './host/workers.js';

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
      await until(() => /Not shared/.test(f.textContent));
      assert.deepEqual(files(env, '.svg'), [], 'cancelled: nothing saved');
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
      assert.match(env.state.notices.at(-1), /this phone cannot share a file of this kind/);
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

// layout_contained, failed_export: an export is laid out where a drawing is — in the layout worker, under the same size and
// time limits, and on the page's thread, under the lower limits, only where no worker can run — and one over a limit
// writes no file and says why, what happened, then what to do
describe('laid out like a drawing, under the same limits', () => {
  const ASK = { path: PATH, graph: 'trip', format: 'svg', theme: 'light' };
  const things = (n, graph = 'trip') =>
    `// graph: ${graph}\n${Array.from({ length: n }, (_, i) => `(t${i}:Thing {name: 'Thing ${i}'})`).join(',\n')}`;
  const noteOf = (block) => ['# Trip', '', fence(block), ''].join('\n');
  const noPageEngine = () => {
    throw new Error('the page’s own thread was used to lay the export out');
  };
  /** Runs `fn` with the plugin loaded over `note`, Workers as `workers` installs them (none when null). */
  async function exporting(note, workers, limits, fn, options = {}) {
    const installed = workers && installWorkers(workers);
    const env = await load({ files: { [PATH]: note }, ...options });
    Object.assign(env.plugin.layoutLimits, limits);
    env.state.notices.length = 0;
    try {
      await fn(env, installed);
    } finally {
      env.plugin.onunload();
      installed?.uninstall();
      env.uninstall();
    }
  }
  const saved = (env) => [...env.state.files.keys()].filter((p) => p !== PATH);

  test('is laid out in the worker, never on the page’s thread, in the fixed colours chosen', async () => {
    await exporting(
      NOTE,
      {},
      {},
      async (env, workers) => {
        const light = await env.plugin.exportGraph(ASK);
        assert.match(light.done, /^Exported /, JSON.stringify(light));
        const dark = await env.plugin.exportGraph({ ...ASK, theme: 'dark' });
        assert.match(dark.done, /^Exported /, JSON.stringify(dark));
        assert.equal(workers.made.length, 1, 'one worker, reused');
        const [a, b] = files(env, '.svg').map((p) => env.state.files.get(p));
        assert.doesNotMatch(a + b, /var\(--|color-mix\(/);
        assert.ok(a.includes('#ffffff') && !a.includes('#1e1e1e'), 'light');
        assert.ok(b.includes('#1e1e1e') && !b.includes('#ffffff'), 'dark');
        // the drawing's own body, which the worker themes, not only the frame the export puts round it: a node's fill is
        // its kind's hue in the palette chosen, so a layout themed in the wrong palette fails here
        const hue = GraphLayout.pick(['Place'], STYLE.kind_hues, STYLE.kind_colours).Place;
        const fill = (theme) => hueColour(hue, 'fill', PALETTES[theme]);
        const node = (svg) => /<g id="node\d+" class="node">[\s\S]*?<\/g>/.exec(svg)?.[0] ?? '';
        assert.notEqual(fill('light'), fill('dark'));
        assert.ok(node(a).includes(`fill:${fill('light')}`), `a node in light: ${node(a)}`);
        assert.ok(node(b).includes(`fill:${fill('dark')}`), `a node in dark: ${node(b)}`);
        assert.ok(!node(b).includes(fill('light')) && !node(a).includes(fill('dark')), 'each in its own palette only');
      },
      { engine: noPageEngine },
    );
  });

  test('a 5,000-thing graph is refused: no file, no layout, and the notice says why and what to do', async () => {
    await exporting(noteOf(things(5000)), {}, {}, async (env, workers) => {
      const out = await env.plugin.exportGraph({ ...ASK, graph: 'trip' });
      assert.equal(
        out.stopped,
        'The export could not be made: this graph has 5,000 things, and at most 2,000 are laid out. Nothing was saved. Export a smaller view of the graph, or split it into smaller graphs.',
      );
      assert.deepEqual(env.state.notices, [out.stopped], 'said once');
      assert.deepEqual(saved(env), [], 'no file, and no temporary one');
      assert.equal(workers.made.length, 0, 'no layout was attempted');
    });
  });

  test('where no worker can run, the page’s lower limits apply, and say so', async () => {
    let started = 0;
    await exporting(
      noteOf(things(301)),
      null,
      {},
      async (env) => {
        const out = await env.plugin.exportGraph(ASK);
        assert.match(
          out.stopped,
          /^The export could not be made: this graph has 301 things, and at most 300 are laid out\. Graphs are laid out on the main thread here, so the limits are lower\. Nothing was saved\./,
        );
        assert.deepEqual(saved(env), []);
        assert.equal(started, 0, 'no layout was attempted');
      },
      {
        engine: () => {
          started++;
          return noPageEngine();
        },
      },
    );
  });

  test('a layout that runs past the time limit is stopped: no file, and the notice says how long it was given', async () => {
    await exporting(NOTE, { swallow: () => true }, { ms: 200 }, async (env, workers) => {
      const out = await env.plugin.exportGraph(ASK);
      assert.equal(
        out.stopped,
        'The export could not be made: laying the graph out took longer than 0.2 seconds, so it was stopped. Nothing was saved. Export a smaller view of the graph, or try again.',
      );
      assert.deepEqual(saved(env), []);
      assert.equal(workers.made[0].terminated, true, 'the stuck worker was stopped');
    });
  });

  test('after 3 layouts in a row take too long, an export says drawing is paused, and writes nothing', async () => {
    await exporting(NOTE, { swallow: () => true }, { ms: 100 }, async (env) => {
      for (let i = 0; i < 3; i++) assert.match((await env.plugin.exportGraph(ASK)).stopped, /took longer/);
      const out = await env.plugin.exportGraph(ASK);
      assert.equal(
        out.stopped,
        'The export could not be made: the last 3 layouts took too long or failed, so no more are started until the plugin is reloaded. Nothing was saved. Reload the plugin, then try again.',
      );
      assert.deepEqual(saved(env), []);
    });
  });

  // 10,000 lines and 512,000 bytes, the limits on the text of a note's graph blocks, as drawing has them
  for (const [limit, pad, said] of [
    ['lines', '// padding\n'.repeat(10_000), /hold 10,0\d\d lines, and at most 10,000 are read/],
    ['bytes', `// ${'x'.repeat(1000)}\n`.repeat(520), /hold 5\d\d(\.\d)? kB of text, and at most 512 kB is read/],
  ])
    test(`a note over the text limit in ${limit} is refused as too large to read, never “nothing to export”`, async () => {
      await exporting(noteOf(`${things(3)}\n${pad}`), {}, {}, async (env, workers) => {
        const out = await env.plugin.exportGraph(ASK);
        assert.match(out.stopped, /^The export could not be made: the graph blocks here /);
        assert.match(out.stopped, said);
        assert.match(out.stopped, /Nothing was saved\. Move some of the graphs to another note\.$/);
        assert.doesNotMatch(out.stopped, /nothing to export/i);
        assert.deepEqual(saved(env), []);
        assert.equal(workers.made.length, 0);
      });
    });

  test('a worker that is gone when the layout is wanted — the plugin unloaded — stops the export quietly, with nothing saved', async () => {
    await exporting(NOTE, { swallow: () => true }, {}, async (env) => {
      const pending = env.plugin.exportGraph(ASK);
      await wait(50);
      env.plugin.onunload();
      const out = await pending;
      assert.equal(
        out.stopped,
        'The export was stopped: Graph Note was unloaded before the layout finished. Nothing was saved. Try again once Graph Note is enabled again.',
      );
      assert.deepEqual(saved(env), []);
    });
  });

  // what happened, why, that nothing was saved, and what to do: a failure of the layout is told like a limit
  const TRY_AGAIN = 'Nothing was saved. Try again; if it keeps failing, reload the plugin.';
  for (const [how, strike] of [
    ['replies with an error', (w, m) => w.onmessage({ data: { id: m.id, error: 'boom' } })],
    ['fails in the middle of the layout', (w) => w.onerror(new Error('boom'))],
  ])
    test(`a layout worker that ${how} stops the export with the reason in brackets and what to do, and writes nothing`, async () => {
      const at = {};
      const swallow = (m) => {
        setTimeout(() => strike(at.workers.made[0], m), 0);
        return true;
      };
      await exporting(NOTE, { swallow }, {}, async (env, workers) => {
        at.workers = workers;
        const out = await env.plugin.exportGraph(ASK);
        assert.equal(out.stopped, `The export could not be made: the layout worker failed (boom). ${TRY_AGAIN}`);
        assert.deepEqual(env.state.notices, [out.stopped], 'said once');
        assert.deepEqual(saved(env), [], 'no file, and no temporary one');
      });
    });

  test('an engine that cannot start is told the same way, with its reason in brackets', async () => {
    await exporting(
      NOTE,
      null,
      {},
      async (env) => {
        const out = await env.plugin.exportGraph(ASK);
        assert.equal(
          out.stopped,
          `The export could not be made: the layout engine could not start (no WebAssembly). ${TRY_AGAIN}`,
        );
        assert.deepEqual(saved(env), []);
      },
      { engine: () => Promise.reject(new Error('no WebAssembly')) },
    );
  });

  test('a word over the limit has advice of its own, and an export says it is laid out where a card says it is drawn', async () => {
    const long = `// graph: trip\n(a:Thing {name: '${'x'.repeat(2000)}'})`;
    await exporting(noteOf(long), {}, { word: 1000 }, async (env, workers) => {
      const out = await env.plugin.exportGraph(ASK);
      assert.equal(
        out.stopped,
        'The export could not be made: a word in this graph is 2,000 characters long, and at most 1,000 are laid out. Nothing was saved. Shorten the long name or text.',
      );
      assert.deepEqual(saved(env), []);
      assert.equal(workers.made.length, 0, 'no layout was attempted');
      const { el } = await show(env, noteOf(long), 0);
      assert.match(
        el.querySelector('.graph-note-banner').textContent,
        /a word in this graph is 2,000 characters long, and at most 1,000 are drawn\./,
        'the card’s banner keeps its words',
      );
    });
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
