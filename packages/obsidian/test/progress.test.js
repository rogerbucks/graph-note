// A wait is shown (editor spec §44, progress_shown). A wait longer than a second shows its progress, said to a screen
// reader too. One longer than ten seconds offers to stop it. Stopped, it leaves nothing half done. The two long waits
// are a drawing being laid out and an export.
import { test, describe, before, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());
afterEach(() => mock.timers.reset());

const PATH = 'Some note.md';
const DATA = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;
const NOTE = ['# Trip', '', fence(DATA), ''].join('\n');
const written = (env, ext) => [...env.state.files.keys()].filter((p) => p.endsWith(ext));

/** Moves the held clock on `ms`, a second at a time, as a real clock would pass. */
const pass = (ms) => {
  for (let left = ms; left > 0; left -= 1000) mock.timers.tick(Math.min(1000, left));
};

/** Lets the promises waiting now run, while the clock is held. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** The progress shown in `el`, or null: its words, and its Stop button when it offers one. */
function progressIn(el) {
  const p = el.querySelector('.thoughtknot-progress');
  if (!p) return null;
  return { el: p, words: p.textContent, stop: labelled(p, 'Stop') };
}

describe('a wait is shown', () => {
  // proves: progress_shown
  test('an export: its progress after a second, Stop after ten, and stopped, nothing is written', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await show(env, NOTE, 0);
      labelled(el, 'Export').click();
      const form = el.querySelector('.thoughtknot-export');
      // the export waits until it is let go, as a slow one would
      const real = env.plugin.exportGraph.bind(env.plugin);
      let release;
      let late;
      env.plugin.exportGraph = (ask) =>
        new Promise((done) => {
          release = () => done((late = real(ask)));
        });
      mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
      labelled(form, 'Export it').click();
      await settle();
      mock.timers.tick(999);
      assert.equal(progressIn(form), null, 'nothing shown for a wait under a second');
      mock.timers.tick(1);
      const shown = progressIn(form);
      assert.ok(shown, 'its progress, after a second');
      assert.equal(shown.el.getAttribute('role'), 'status', 'said to a screen reader');
      assert.match(shown.words, /Exporting/);
      assert.equal(shown.stop, undefined, 'no Stop yet');
      pass(9000);
      const long = progressIn(form);
      assert.ok(long.stop, 'Stop, after ten seconds');
      long.stop.click();
      await settle();
      assert.equal(progressIn(form), null, 'stopped, the progress goes');
      assert.match(form.textContent, /stopped/i);
      mock.timers.reset();
      release();
      assert.match((await late).stopped ?? '', /stopped/i, 'it comes back stopped');
      assert.deepEqual(written(env, '.svg'), [], 'and nothing is written when the export comes back late');
    } finally {
      env.uninstall();
    }
  });

  // proves: progress_shown
  test('a drawing laid out: its progress after a second, Stop after ten, and stopped, the graph is shown as text', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      env.plugin.layout = () => new Promise(() => {}); // a layout that never comes back
      mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
      void show(env, NOTE, 0);
      await settle();
      const el = env.doc.body.querySelector('.block-language-gql');
      mock.timers.tick(999);
      assert.equal(progressIn(el), null, 'nothing shown for a wait under a second');
      mock.timers.tick(1);
      assert.match(progressIn(el)?.words ?? '', /Drawing/);
      assert.equal(progressIn(el).el.getAttribute('role'), 'status');
      pass(9000);
      progressIn(el).stop.click();
      await settle();
      assert.equal(progressIn(el), null, 'stopped, the progress goes');
      assert.match(el.textContent, /stopped/i, 'said in words');
      assert.ok(el.querySelector('code')?.textContent.includes("(home:Place {name: 'Home'})"), 'the graph as text');
    } finally {
      mock.timers.reset();
      env.uninstall();
    }
  });

  // proves: progress_shown
  test('a wait that ends within a second shows nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await show(env, NOTE, 0);
      await until(() => el.querySelector('svg'));
      assert.equal(progressIn(el), null);
    } finally {
      env.uninstall();
    }
  });
});
