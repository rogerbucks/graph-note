// Play stepping through a walked path on its own (editor spec §7, path_autoplay): from the step it is on, one step at the
// pace set, until the last; paused or stopped at any step, and played on from where it was paused; a pace the user sets
// taken at once. The host hands in its timer, so nothing here waits on the clock: the tests run each step themselves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { PathPlayer, pathsOf } from '../src/paths.ts';
import { DEFAULT_PACE, PATH_PACES, PathAutoplay, paceSaid } from '../src/path-play.ts';

const WALKED = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(tour:Path {title: 'Sunday walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 3}]->(cafe)`;

/** A timer a test runs by hand: each step waiting, with how long it was asked to wait. */
function handTimer() {
  const waiting = new Map();
  let n = 0;
  return {
    after(ms, run) {
      waiting.set(++n, { ms, run });
      return n;
    },
    cancel(handle) {
      waiting.delete(handle);
    },
    /** The waits asked for and not yet run or cancelled. */
    get pending() {
      return [...waiting.values()].map((w) => w.ms);
    },
    /** Runs the one wait pending, as the clock would when its time came. */
    tick() {
      assert.equal(waiting.size, 1, 'one step waits at a time');
      const [[handle, w]] = waiting;
      waiting.delete(handle);
      w.run();
    },
  };
}

const walk = () => pathsOf(readNote([WALKED]), 'trip')[0];
const on = (play) => play.player.current.key;

describe('Play steps through a path on its own', () => {
  // proves: path_autoplay
  test('from the first step, one step at the pace set, and it stops at the last', () => {
    const timer = handTimer(),
      play = new PathAutoplay(new PathPlayer(walk()), timer, 1000);
    const told = [];
    play.onStep = () => told.push(play.player.sentence);
    play.play();
    assert.equal(on(play), 'home');
    assert.ok(play.playing);
    assert.deepEqual(timer.pending, [1000]);
    timer.tick();
    assert.equal(on(play), 'park');
    timer.tick();
    assert.equal(on(play), 'cafe');
    assert.ok(!play.playing, 'at the last step it stops on its own');
    assert.deepEqual(timer.pending, []);
    assert.deepEqual(told, ['Step 2 of 3: The park', 'Step 3 of 3: Cafe']);
  });

  // proves: path_autoplay
  test('the pace is the one the user sets, taken at once while it plays', () => {
    const timer = handTimer(),
      play = new PathAutoplay(new PathPlayer(walk()), timer);
    assert.equal(play.pace, DEFAULT_PACE);
    play.play();
    assert.deepEqual(timer.pending, [DEFAULT_PACE]);
    play.setPace(500);
    assert.deepEqual(timer.pending, [500], 'the step waiting now waits the new pace');
    assert.equal(play.pace, 500);
    for (const odd of [0, -1, Number.NaN, Infinity]) {
      play.setPace(odd);
      assert.equal(play.pace, 500, `${odd} is no pace: the last one is kept`);
    }
    assert.ok(PATH_PACES.includes(DEFAULT_PACE));
    assert.deepEqual(PATH_PACES.map(paceSaid), [
      'Half a second a step',
      '1 second a step',
      '2 seconds a step',
      '4 seconds a step',
    ]);
  });

  // proves: path_autoplay
  test('it pauses at any step, and plays on from that step', () => {
    const timer = handTimer(),
      play = new PathAutoplay(new PathPlayer(walk()), timer, 1000);
    play.play();
    timer.tick();
    play.pause();
    assert.ok(!play.playing);
    assert.deepEqual(timer.pending, []);
    assert.equal(on(play), 'park', 'paused on the step it was on');
    play.play();
    assert.equal(on(play), 'park', 'played on from there');
    timer.tick();
    assert.equal(on(play), 'cafe');
  });

  // proves: path_autoplay
  test('it stops at any step, and nothing more happens', () => {
    const timer = handTimer(),
      play = new PathAutoplay(new PathPlayer(walk()), timer, 1000);
    let told = 0;
    play.onStep = () => told++;
    play.play();
    play.stop();
    assert.ok(!play.playing && play.stopped);
    assert.deepEqual(timer.pending, []);
    play.play();
    assert.deepEqual(timer.pending, [], 'a stopped play does not start again');
    assert.equal(told, 0);
  });

  // proves: path_autoplay
  test('a step taken by hand pauses it, so the two never fight', () => {
    const timer = handTimer(),
      play = new PathAutoplay(new PathPlayer(walk()), timer, 1000);
    play.play();
    assert.ok(play.next());
    assert.equal(on(play), 'park');
    assert.ok(!play.playing);
    assert.deepEqual(timer.pending, []);
    assert.ok(play.previous());
    assert.equal(on(play), 'home');
  });

  // proves: path_autoplay
  test('played again from its last step, it starts from the first', () => {
    const timer = handTimer(),
      play = new PathAutoplay(new PathPlayer(walk()), timer, 1000);
    play.play();
    timer.tick();
    timer.tick();
    assert.equal(on(play), 'cafe');
    play.play();
    assert.equal(on(play), 'home');
    assert.ok(play.playing);
  });

  // proves: path_autoplay
  test('a path of one step is shown, and stops at once', () => {
    const one = { ...walk(), steps: walk().steps.slice(0, 1) };
    const timer = handTimer(),
      play = new PathAutoplay(new PathPlayer(one), timer, 1000);
    play.play();
    assert.equal(on(play), 'home');
    assert.ok(!play.playing);
    assert.deepEqual(timer.pending, []);
  });
});
