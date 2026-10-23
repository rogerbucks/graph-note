// The first-run journey, in every host (editor spec §41, ux_journey_auto). A person opens a note, reads its graph,
// edits it, fixes a problem and exports it. Each host's journey is scripted in test/repository/journey-obsidian.js and
// journey-page.js, and each stage checks what it left. Every action goes through a Journey (scripts/ux-journey.mjs),
// which counts the journey's steps and interactions.
//
// The counts are metrics of the quality ratchet, held by quality/baseline.json with no room. One more step or
// interaction fails unless quality/accepted.json records why. The counting and the ratchet's hold are tried first, so a
// pass means they looked.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { build } from '../packages/obsidian/test/host/load-plugin.js';
import { cleanUp } from '../packages/claude-code/test/editor-page-support.js';
import { METRICS, compare } from '../scripts/quality-check.mjs';
import { HOSTS, Journey, STAGES, countsOf, named } from '../scripts/ux-journey.mjs';
import { JOURNEYS } from './repository/journeys.js';
import { ROOT, readJSON } from './repository/repo.js';

const baseline = () => readJSON('quality/baseline.json');
const accepted = () => readJSON('quality/accepted.json').accepted;
const JOURNEY_METRICS = Object.values(HOSTS).flatMap((h) => [h.steps, h.interactions]);
/** What the ratchet says of a run's journey counts: the failures among them, by metric. */
const held = (metrics, reasons = accepted()) =>
  compare(baseline(), { metrics }, reasons, { partial: true }).failures.filter((f) =>
    JOURNEY_METRICS.includes(f.metric),
  );

describe('the counting itself', () => {
  test('an interaction is each action; a step is a run of them on one control', () => {
    const at = (...controls) => controls.map((control) => ({ stage: 'edit it', control }));
    assert.deepEqual(countsOf([]), { steps: 0, interactions: 0 });
    assert.deepEqual(countsOf(at('Edit here', 'Text', 'Done editing')), { steps: 3, interactions: 3 });
    assert.deepEqual(countsOf(at('Zoom in', 'Zoom in', 'Zoom in')), { steps: 1, interactions: 3 });
    assert.deepEqual(countsOf(at('Zoom in', 'Fit', 'Zoom in')), { steps: 3, interactions: 3 });
  });

  test('the stages are the journey’s own, in order, and a journey that stops short gives no counts', async () => {
    assert.deepEqual(STAGES, ['open the note', 'read the graph', 'edit it', 'fix a problem', 'export it']);
    const person = new Journey('obsidian');
    await assert.rejects(() => person.use('Fit', () => {}), /has not begun/);
    assert.throws(() => person.stage('edit it'), /next stage is "open the note"/);
    person.stage('open the note');
    await person.use('the note', () => {});
    assert.throws(() => person.metrics(), /stopped after "open the note"/);
    for (const s of STAGES.slice(1)) person.stage(s);
    await person.use('Export it', () => {});
    assert.deepEqual(person.metrics(), { journey_steps_obsidian: 2, journey_interactions_obsidian: 2 });
    assert.throws(() => new Journey('emacs'), /no such host/);
  });

  test('a control is found by the name a screen reader says: its label, what labels it, or its own text', () => {
    const { document } = new JSDOM(
      `<button aria-label="Zoom in">+</button><p id="t">Text of graph reader</p>
       <textarea aria-labelledby="t"></textarea><button>Export it</button><div class="x">Fit</div>`,
    ).window;
    assert.equal(named(document, 'Zoom in').textContent, '+');
    assert.equal(named(document, 'Text of graph reader').tagName, 'TEXTAREA');
    assert.equal(named(document, 'Export it').tagName, 'BUTTON');
    assert.equal(named(document, '+'), undefined, 'a label is the name, over the text');
    assert.equal(named(document, 'Fit'), undefined, 'what is not a control is not found');
  });
});

describe('the quality ratchet holds the counts', () => {
  test('each count is a metric with no room, and the baseline holds every one', () => {
    for (const name of JOURNEY_METRICS) {
      assert.deepEqual([METRICS[name]?.better, METRICS[name]?.tolerance, METRICS[name]?.slack], ['lower', 0, 0], name);
      assert.equal(typeof baseline().metrics[name], 'number', `${name} is in the baseline`);
    }
  });

  test('one more step or interaction than the baseline fails, naming it, unless a reason is recorded', () => {
    const base = Object.fromEntries(JOURNEY_METRICS.map((n) => [n, baseline().metrics[n]]));
    assert.deepEqual(held(base), []);
    const name = HOSTS['claude-code'].interactions;
    const more = { ...base, [name]: base[name] + 1 };
    const found = held(more, []);
    assert.deepEqual(
      found.map((f) => f.metric),
      [name],
    );
    assert.match(found[0].message, /got worse.*quality\/accepted\.json/);
    const why = { metric: name, from: base[name], to: base[name] + 1, reason: 'wanted', date: '2026-10-19' };
    assert.deepEqual(held(more, [why]), []);
    assert.deepEqual(held({ ...base, [name]: base[name] - 1 }, []), [], 'fewer is better, and passes');
  });
});

describe('every host: the first-run journey, its counts held', () => {
  before(() => build());
  after(cleanUp);

  test('every host has its journey: a new host with none fails', () => {
    // the packages that are libraries draw no interface of their own (as test/wcag.test.js reads them)
    const hosts = readdirSync(`${ROOT}/packages`).filter(
      (p) => !p.startsWith('.') && !['core', 'graph-spec'].includes(p),
    );
    assert.deepEqual(hosts.sort(), Object.keys(HOSTS).sort());
    assert.deepEqual(Object.keys(JOURNEYS).sort(), Object.keys(HOSTS).sort());
  });

  for (const host of Object.keys(HOSTS))
    test(`${host}: a person opens a note, reads its graph, edits it, fixes a problem and exports it, in as few steps as the baseline holds`, async () => {
      const person = await JOURNEYS[host]();
      assert.deepEqual(person.stages, STAGES);
      const metrics = person.metrics();
      const trail = person.trail.map((t) => `  ${t.stage}: ${t.control}`).join('\n');
      assert.deepEqual(held(metrics), [], `the journey in ${host}:\n${trail}`);
    });
});
