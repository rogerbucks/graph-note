// Playing a test run (editor spec §35, playback_controller). It autoplays at the transitions' natural pace, or steps
// forward and back by hand. It is in one mode at a time, and a step by hand pauses autoplay. The controller is a thing whose visits
// are an ephemeral log; only a visit that bears a consequence lasts, as a link.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { PlaybackController, TestRun, naturalPace } from '@thoughtknot/core';
import { build, load } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { PROCESS, handTimer, noteOf, panel } from './host/process-notes.js';

before(() => build());

const PATH = 'Refunds.md';
const graphOf = (text) => Object.values(gs.worldFromStore(gs.read([text])))[0];

/** A scheduler run by hand, for the core's player alone. */
function hand() {
  const waiting = [];
  return {
    waiting,
    after: (ms, run) => (waiting.push({ ms, run }), waiting.length),
    cancel: (h) => (waiting[h - 1] = null),
    tick() {
      const at = waiting.findLastIndex((w) => w !== null);
      const w = waiting[at];
      waiting[at] = null;
      w.run();
    },
    get pending() {
      return waiting.filter((w) => w !== null).map((w) => w.ms);
    },
  };
}

test('stepping back pauses autoplay, each visit is an ephemeral log entry, and only a consequence-bearing visit persists as a link', async () => {
  const env = await load({ files: { [PATH]: noteOf(PROCESS) } });
  const timer = handTimer(env);
  try {
    const { el } = await show(env, env.state.files.get(PATH));
    labelled(el, 'Debug Refund').click();
    labelled(el, 'Play').click();
    assert.ok(labelled(el, 'Pause'), 'one mode at a time: autoplay offers Pause');
    timer.tick();
    labelled(el, 'Step back').click();
    assert.deepEqual(timer.pending, [], 'the step back paused autoplay');
    assert.ok(labelled(el, 'Play'), 'and Play is offered again');
    assert.equal(panel(el)[0], 'Start: in Asked');
  } finally {
    env.uninstall();
  }

  const g = graphOf(PROCESS);
  const player = new PlaybackController(new TestRun(() => g, { inputs: { amount: 50 } }), hand());
  assert.deepEqual([...player.thing[0]], ['Playback'], 'the controller is a thing');
  player.forward();
  player.forward();
  assert.deepEqual(player.visits, [
    { step: 1, transition: 'transition:asked->checked', consequence: false },
    { step: 2, transition: 'pay', consequence: true },
  ]);
  assert.deepEqual(
    player.lasting(),
    [['playback:test-run', 'VISITED', 'pay', { step: 2 }]],
    'only the side effect lasts',
  );
  player.back();
  assert.deepEqual(
    player.visits.map((v) => v.transition),
    ['transition:asked->checked'],
  );
  assert.ok(!g.nodes.has('playback:test-run'), 'the visits were never written into the graph');
  player.stop();
  assert.deepEqual(player.visits, [], 'the log goes when it stops');
});

test('autoplay takes each transition at its natural pace, and a step forward by hand pauses it', () => {
  const g = graphOf(
    PROCESS.replace('(asked)-[:TRANSITION]->(checked)', '(asked)-[:TRANSITION {duration: 4}]->(checked)'),
  );
  assert.equal(naturalPace(g, 'transition:asked->checked'), 4000);
  assert.equal(naturalPace(g, 'pay'), 2000, 'the default where none is given');
  const clock = hand();
  const player = new PlaybackController(new TestRun(() => g, { inputs: { amount: 50 } }), clock);
  player.play();
  assert.equal(player.mode, 'autoplay');
  assert.deepEqual(clock.pending, [2000]);
  clock.tick();
  assert.deepEqual(clock.pending, [4000], 'the stop after a four-second transition is shown for four seconds');
  player.forward();
  assert.equal(player.mode, 'manual');
  assert.deepEqual(clock.pending, []);
});
