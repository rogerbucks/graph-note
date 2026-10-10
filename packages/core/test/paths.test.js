// Walked paths (editor spec §7; graph spec §22): a path recorded from boxes tapped in order is stored as a Path node with
// ordered STEP edges, plays step by step, and is reported when it steps through something removed or has no steps.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@graph-note/graph-spec';
import { readNote } from '../src/drawing.ts';
import { PathPlayer, PathRecorder, pathBlock, pathProblems, pathsOf } from '../src/paths.ts';

const TRIP = `// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(lake:Place {name: 'The lake'})`;

// the same graph with a path that steps through something that is not there (its second step), on line 8 of the block
const BROKEN = `${TRIP},
(tour:Path {title: 'Walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(zzzzzzz),
(tour)-[:STEP {seq: 3}]->(cafe)`;

const made = (r) => {
  assert.ok(!('refused' in r), 'refused: ' + (r.refused ?? ''));
  return r;
};
const worldOf = (...blocks) => gs.worldFromStore(gs.read(blocks));
/** A problem's edit applied to its block, as a host applies a replace at a span. */
const applied = (text, p) => {
  const lines = text.split('\n'),
    s = p.span;
  const line = lines[s.line];
  assert.equal(line.slice(s.character, s.end), p.replace.written, 'the span holds what the edit replaces');
  // the edits made with it, such as the later steps numbered again, the last first so each place still holds
  const edits = [{ span: s, text: p.replace.with[0] }, ...(p.also ?? [])].sort(
    (a, b) => b.span.line - a.span.line || b.span.character - a.span.character,
  );
  for (const e of edits) {
    const l = lines[e.span.line];
    lines[e.span.line] = l.slice(0, e.span.character) + e.text + l.slice(e.span.end);
  }
  return lines.join('\n');
};

describe('recording a walk', () => {
  // proves: record_and_play
  test('a tap adds a step; the last step tapped again does nothing; an earlier one is added again', () => {
    const r = new PathRecorder();
    assert.equal(r.tap('home'), true);
    assert.equal(r.tap('home'), false);
    assert.equal(r.tap('park'), true);
    assert.equal(r.tap('home'), true);
    assert.deepEqual(r.steps, ['home', 'park', 'home']);
  });

  // proves: record_and_play
  test('undo takes the last step off, saying which; clear starts again; undo of nothing says so', () => {
    const r = new PathRecorder();
    r.tap('home');
    r.tap('park');
    assert.equal(r.undo(), 'park');
    assert.deepEqual(r.steps, ['home']);
    r.clear();
    assert.deepEqual(r.steps, []);
    assert.equal(r.undo(), undefined);
  });

  // proves: record_and_play
  test('the steps are a copy: changing what was read never changes the recording', () => {
    const r = new PathRecorder();
    r.tap('home');
    const seen = r.steps;
    assert.throws(() => {
      seen.push('park');
    });
    assert.deepEqual(r.steps, ['home']);
  });
});

describe('a walked path is data', () => {
  // proves: walked_path_is_data
  test('the recorded steps are a Path node with STEP edges numbered 1 to n, in the order tapped', () => {
    const r = made(pathBlock(readNote([TRIP]), 'trip', TRIP, 'A walk', ['home', 'park', 'cafe']));
    const g = worldOf(r.text).trip;
    assert.deepEqual(g.labelled('Path'), [r.id]);
    assert.equal(g.p(r.id).title, 'A walk');
    assert.deepEqual(
      g.out(r.id, 'STEP').map((e) => [e[3].seq, e[2]]),
      [
        [1, 'home'],
        [2, 'park'],
        [3, 'cafe'],
      ],
    );
  });

  // proves: walked_path_is_data
  test('a walk may revisit: a thing stepped to twice has two STEP edges', () => {
    const r = made(pathBlock(readNote([TRIP]), 'trip', TRIP, 'Out and back', ['home', 'park', 'home']));
    const g = worldOf(r.text).trip;
    assert.deepEqual(
      g.out(r.id, 'STEP').map((e) => [e[3].seq, e[2]]),
      [
        [1, 'home'],
        [2, 'park'],
        [3, 'home'],
      ],
    );
  });

  // proves: walked_path_is_data
  test('the block reads with no new problem, and passes the graph spec’s §22 rules', () => {
    const before = readNote([TRIP]);
    const r = made(pathBlock(before, 'trip', TRIP, 'A walk', ['home', 'park', 'home']));
    assert.deepEqual(readNote([r.text]).problems, before.problems);
    const w = worldOf(r.text);
    assert.deepEqual(
      gs.pathsRules(w.trip).filter(([, ok]) => !ok),
      [],
    );
    assert.deepEqual(
      gs.check(w, 'trip').filter(([label, ok]) => label.startsWith('§22') && !ok),
      [],
    );
  });

  // proves: walked_path_is_data
  test('the path is written as the other patterns are: comma-joined, the old text kept byte for byte', () => {
    const r = made(pathBlock(readNote([TRIP]), 'trip', TRIP, 'A walk', ['home', 'park']));
    assert.equal(
      r.text,
      `${TRIP},\n(${r.id}:Path {title: 'A walk'}),\n(${r.id})-[:STEP {seq: 1}]->(home),\n(${r.id})-[:STEP {seq: 2}]->(park)`,
    );
  });

  // proves: walked_path_is_data
  test('a long title is laid out over lines, indented as the settings say', () => {
    const title = 'A long and winding walk through the whole of the town';
    const r = made(pathBlock(readNote([TRIP]), 'trip', TRIP, title, ['home'], '\t'));
    assert.match(r.text, new RegExp(`\\(${r.id}:Path \\{\\n\\ttitle: '${title}'\\}\\),`));
    assert.equal(worldOf(r.text).trip.p(r.id).title, title);
  });

  // proves: walked_path_is_data
  test('a quote in the title is written as GQL writes it, and reads back whole', () => {
    const r = made(pathBlock(readNote([TRIP]), 'trip', TRIP, "Roger's walk", ['home']));
    assert.equal(worldOf(r.text).trip.p(r.id).title, "Roger's walk");
  });

  // proves: walked_path_is_data
  test('the id is fresh: never one the graph already has, whichever block has it', () => {
    const other = `// graph: trip · SOURCE\n(walk:Place {name: 'Walk'})`;
    const r = made(pathBlock(readNote([TRIP, other]), 'trip', TRIP, 'Walk', ['home']));
    assert.notEqual(r.id, 'walk');
    assert.doesNotThrow(() => gs.read([r.text, other]));
    assert.deepEqual(readNote([r.text, other]).problems, readNote([TRIP, other]).problems);
  });

  // proves: walked_path_is_data
  test('after a trailing comma or a comment, the old text is kept and the block reads no worse', () => {
    for (const tail of [',', '\n// more to come', ',\n// more to come\n', ',\n\n']) {
      const block = TRIP + tail;
      const before = readNote([block]);
      const r = made(pathBlock(before, 'trip', block, 'A walk', ['home', 'park']));
      const label = JSON.stringify(tail);
      assert.ok(r.text.startsWith(TRIP), label);
      assert.ok(r.text.endsWith(tail.replace(/^,/, '')), label);
      const known = new Set(before.problems.map((p) => p.message));
      assert.deepEqual(
        readNote([r.text]).problems.filter((p) => !known.has(p.message)),
        [],
        label,
      );
      assert.equal(worldOf(r.text).trip.out(r.id, 'STEP').length, 2, label);
    }
  });

  // proves: walked_path_is_data
  test('a block that holds only its graph line gets the path without a leading comma', () => {
    const block = '// graph: trip · SOURCE';
    const r = made(pathBlock(readNote([TRIP, block]), 'trip', block, 'A walk', ['home']));
    assert.doesNotThrow(() => gs.read([TRIP, r.text]));
    assert.deepEqual(readNote([TRIP, r.text]).problems, []);
  });

  // proves: walked_path_is_data
  test('a locked graph that does not declare Path and STEP is refused, saying what to declare', () => {
    const schema = `// graph: trip · SOURCE
(trip_schema:GraphMeta {graph: 'trip', schema: 'trip@1'}),
(kind_place:Meta:ElementType {name: 'Place', kind: 'node', origin: 'source'}),
(trip_schema)-[:DECLARES]->(kind_place)`;
    const r = pathBlock(readNote([TRIP, schema]), 'trip', TRIP, 'A walk', ['home']);
    assert.ok('refused' in r);
    assert.match(r.refused, /Path and STEP/);
  });

  // proves: walked_path_is_data
  test('a locked graph that declares them takes the path with no new problem', () => {
    const schema = `// graph: trip · SOURCE
(trip_schema:GraphMeta {graph: 'trip', schema: 'trip@1'}),
(kind_place:Meta:ElementType {name: 'Place', kind: 'node', origin: 'source'}),
(kind_path:Meta:ElementType {name: 'Path', kind: 'node', origin: 'source'}),
(link_step:Meta:ElementType {name: 'STEP', kind: 'edge', origin: 'source', reading: 'steps to', reverse_name: 'is a step of'}),
(trip_schema)-[:DECLARES]->(kind_place),
(trip_schema)-[:DECLARES]->(kind_path),
(trip_schema)-[:DECLARES]->(link_step)`;
    const before = readNote([TRIP, schema]);
    const r = made(pathBlock(before, 'trip', TRIP, 'A walk', ['home', 'park']));
    assert.deepEqual(readNote([r.text, schema]).problems, before.problems);
  });
});

describe('what a path is refused', () => {
  const refusal = (steps, title = 'A walk') => {
    const r = pathBlock(readNote([TRIP]), 'trip', TRIP, title, steps);
    assert.ok('refused' in r, 'it was refused');
    return r.refused;
  };

  // proves: path_no_steps
  test('no steps: refused, with a reason, so no empty path is ever written', () => {
    assert.match(refusal([]), /no steps/);
  });

  // proves: walked_path_is_data
  test('a step that is not in the graph: refused, naming it', () => {
    assert.match(refusal(['home', 'nowhere']), /nowhere.*not in graph trip/);
  });

  // proves: walked_path_is_data
  test('a step that is another path, or a concept: refused, as §22 rule 1 and rule 3 would fail it', () => {
    const block = `${TRIP},\n(inner:Path {title: 'Inner'}),\n(inner)-[:STEP {seq: 1}]->(home),\n(idea:Concept {name: 'Idea'})`;
    const reading = readNote([block]);
    for (const key of ['inner', 'idea']) {
      const r = pathBlock(reading, 'trip', block, 'A walk', ['home', key]);
      assert.ok('refused' in r, key);
      assert.match(r.refused, new RegExp(key));
    }
  });

  // proves: walked_path_is_data
  test('no title, or a graph that is not there: refused, with a reason', () => {
    assert.match(refusal(['home'], '  '), /title/);
    const r = pathBlock(readNote([TRIP]), 'elsewhere', TRIP, 'A walk', ['home']);
    assert.ok('refused' in r);
    assert.match(r.refused, /elsewhere/);
  });
});

describe('the paths of a graph, as data', () => {
  // proves: record_and_play
  test('each path with its title and its steps in seq order, however they were written', () => {
    const block = `${TRIP},
(tour:Path {title: 'Walk'}),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 3}]->(home)`;
    assert.deepEqual(pathsOf(readNote([block]), 'trip'), [
      {
        id: 'tour',
        title: 'Walk',
        empty: false,
        steps: [
          { seq: 1, key: 'home', text: 'Home', missing: false },
          { seq: 2, key: 'park', text: 'The park', missing: false },
          { seq: 3, key: 'home', text: 'Home', missing: false },
        ],
      },
    ]);
  });

  // proves: record_and_play
  test('a recorded path reads back as it was recorded', () => {
    const r = made(pathBlock(readNote([TRIP]), 'trip', TRIP, 'A walk', ['lake', 'home', 'lake']));
    const [path] = pathsOf(readNote([r.text]), 'trip');
    assert.deepEqual(
      path.steps.map((s) => s.key),
      ['lake', 'home', 'lake'],
    );
    assert.equal(path.title, 'A walk');
  });

  // proves: record_and_play
  test('a graph with no paths has none, and a graph that is not there has none', () => {
    assert.deepEqual(pathsOf(readNote([TRIP]), 'trip'), []);
    assert.deepEqual(pathsOf(readNote([TRIP]), 'elsewhere'), []);
  });
});

describe('playing a path', () => {
  const walk = () => {
    const r = made(pathBlock(readNote([TRIP]), 'trip', TRIP, 'A walk', ['home', 'park', 'cafe']));
    return pathsOf(readNote([r.text]), 'trip')[0];
  };

  // proves: record_and_play
  test('play steps through the path in order, from the first step to the last, and stops at either end', () => {
    const player = new PathPlayer(walk());
    assert.ok(player.atStart && !player.atEnd);
    assert.equal(player.current.key, 'home');
    assert.equal(player.previous(), false);
    assert.equal(player.next(), true);
    assert.equal(player.current.key, 'park');
    assert.ok(!player.atStart && !player.atEnd);
    assert.equal(player.next(), true);
    assert.equal(player.current.key, 'cafe');
    assert.ok(player.atEnd);
    assert.equal(player.next(), false);
    assert.equal(player.current.key, 'cafe');
    assert.equal(player.previous(), true);
    assert.equal(player.current.key, 'park');
  });

  // proves: record_and_play
  test('each step has a sentence a screen reader can say: its place, how many, and the text of the thing', () => {
    const player = new PathPlayer(walk());
    assert.equal(player.sentence, 'Step 1 of 3: Home');
    player.next();
    assert.equal(player.sentence, 'Step 2 of 3: The park');
    assert.deepEqual(player.sentences, ['Step 1 of 3: Home', 'Step 2 of 3: The park', 'Step 3 of 3: Cafe']);
  });

  // proves: path_missing_step
  test('a missing step is never skipped: it is stopped on and announced as missing', () => {
    const [path] = pathsOf(readNote([BROKEN]), 'trip');
    const player = new PathPlayer(path);
    assert.equal(player.sentence, 'Step 1 of 3: Home');
    player.next();
    assert.equal(player.current.missing, true);
    assert.equal(player.sentence, 'Step 2 of 3: missing. zzzzzzz is not in the graph.');
    player.next();
    assert.equal(player.sentence, 'Step 3 of 3: Cafe');
  });

  // proves: path_no_steps
  test('a path with no steps is refused: it is never played as an empty story', () => {
    const path = pathsOf(readNote([`${TRIP},\n(tour:Path {title: 'Walk'})`]), 'trip')[0];
    assert.equal(PathPlayer.refusal(path), 'the path Walk has no steps');
    assert.throws(() => new PathPlayer(path), /the path Walk has no steps/);
    assert.equal(PathPlayer.refusal(walk()), null);
  });
});

describe('a step through something removed', () => {
  // proves: path_missing_step
  test('is reported on the step’s own line, with the fix to remove the step or restore the thing', () => {
    const [p, ...rest] = pathProblems(readNote([BROKEN]));
    assert.deepEqual(rest, []);
    assert.equal(p.graph, 'trip');
    assert.equal(p.block, 0);
    assert.equal(p.line, 8);
    assert.equal(p.severity, 'error');
    assert.equal(p.message, 'the path Walk steps through zzzzzzz, which is not in graph trip');
    assert.equal(p.fix, 'remove the step, or restore zzzzzzz');
  });

  // proves: path_missing_step
  test('offers an edit that removes the step, which then reads clean', () => {
    const [p] = pathProblems(readNote([BROKEN]));
    assert.equal(p.fixTitle, 'Remove the step');
    const fixed = applied(BROKEN, p);
    assert.deepEqual(pathProblems(readNote([fixed])), []);
    assert.deepEqual(readNote([fixed]).problems, []);
    assert.deepEqual(
      pathsOf(readNote([fixed]), 'trip')[0].steps.map((s) => s.key),
      ['home', 'cafe'],
    );
  });

  // proves: path_missing_step
  test('removing a step in the middle numbers the later steps again, so the path keeps §22’s steps 1 to n', () => {
    const [p] = pathProblems(readNote([BROKEN]));
    const fixed = applied(BROKEN, p);
    assert.match(fixed, /\(tour\)-\[:STEP \{seq: 2\}\]->\(cafe\)/);
    const g = worldOf(fixed).trip;
    for (const [rule, ok] of gs.pathsRules(g)) assert.ok(ok, rule);
  });

  // proves: path_missing_step
  test('is in what a note reads to, once, so the badge counts it: the reader’s own report is replaced, not doubled', () => {
    const reading = readNote([BROKEN]);
    assert.equal(reading.problems.length, 1);
    assert.deepEqual(reading.problems, pathProblems(reading));
    assert.deepEqual(pathProblems(reading), pathProblems(readNote([BROKEN])));
  });

  // proves: path_missing_step
  test('a near miss still drawn as an estimate keeps its change, and the fix says all three ways out', () => {
    const block = BROKEN.replace('zzzzzzz', 'parl');
    const reading = readNote([block]);
    const [p, ...rest] = pathProblems(reading);
    assert.deepEqual(rest, []);
    assert.equal(p.severity, 'warning');
    assert.equal(
      p.message,
      'the path Walk steps through parl, which is not in graph trip; it is drawn as an estimate of park',
    );
    assert.equal(p.fix, 'change parl to park, remove the step, or restore parl');
    assert.deepEqual(p.replace, { written: 'parl', with: ['park'] });
    assert.deepEqual(reading.problems, [p]);
    assert.equal(reading.graphs.get('trip').estimates.length, 1);
  });

  // proves: path_missing_step
  test('a link that is not a STEP, or not from a path, is left to the reader’s own report', () => {
    const block = `${TRIP},\n(tour:Path {title: 'Walk'}),\n(tour)-[:STEP {seq: 1}]->(home),\n(home)-[:NEAR]->(zzzzzzz)`;
    const reading = readNote([block]);
    assert.deepEqual(pathProblems(reading), []);
    assert.equal(reading.problems.length, 1);
    assert.match(reading.problems[0].message, /no thing called zzzzzzz/);
  });

  // proves: path_missing_step
  test('written over two blocks, it is found in the block that holds the step', () => {
    const second = `// graph: trip · SOURCE\n(tour)-[:STEP {seq: 2}]->(zzzzzzz)`;
    const first = `${TRIP},\n(tour:Path {title: 'Walk'}),\n(tour)-[:STEP {seq: 1}]->(home)`;
    const [p] = pathProblems(readNote([first, second]));
    assert.equal(p.block, 1);
    assert.equal(p.line, 2);
    assert.equal(pathsOf(readNote([first, second]), 'trip')[0].steps[1].missing, true);
  });
});

describe('a path with no steps', () => {
  const EMPTY = `${TRIP},\n(tour:Path {title: 'Walk'})`;

  // proves: path_no_steps
  test('is reported on the line that writes it, with its fix, and is in what a note reads to', () => {
    const reading = readNote([EMPTY]);
    const [p, ...rest] = pathProblems(reading);
    assert.deepEqual(rest, []);
    assert.equal(p.graph, 'trip');
    assert.equal(p.block, 0);
    assert.equal(p.line, 6);
    assert.equal(p.severity, 'warning');
    assert.equal(p.message, 'the path Walk has no steps');
    assert.equal(p.fix, 'record its steps by tapping boxes in order, or remove the path');
    assert.deepEqual(reading.problems, [p]);
  });

  // proves: path_no_steps
  test('is marked, so the host never draws or plays it as an empty story', () => {
    const [path] = pathsOf(readNote([EMPTY]), 'trip');
    assert.equal(path.empty, true);
    assert.deepEqual(path.steps, []);
  });

  // proves: path_no_steps
  test('once a step is written, the report goes', () => {
    const r = pathProblems(readNote([`${EMPTY},\n(tour)-[:STEP {seq: 1}]->(home)`]));
    assert.deepEqual(r, []);
  });

  // proves: path_no_steps
  test('asking again of a reading that already holds the report gives the same report, never two', () => {
    const reading = readNote([EMPTY]);
    assert.deepEqual(pathProblems(reading), pathProblems({ ...reading, problems: [...reading.problems] }));
    assert.equal(reading.problems.length, 1);
  });

  // proves: path_no_steps
  test('a graph is asked of alone when it is named, and every graph when it is not', () => {
    const other = `// graph: other · SOURCE\n(lonely:Path {title: 'Lonely'})`;
    const reading = readNote([EMPTY, other]);
    assert.deepEqual(
      pathProblems(reading, 'other').map((p) => p.graph),
      ['other'],
    );
    assert.deepEqual(
      pathProblems(reading).map((p) => p.graph),
      ['trip', 'other'],
    );
  });
});
