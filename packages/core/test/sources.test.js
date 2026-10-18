// Graph sources (editor spec §20, gql_file_source, gql_file_missing). A block whose graph line says `· FROM` and a
// place draws its graph from a .gql file, or from another note. It is read where it is written and never copied into
// the note. It goes through the same partial reader and limits as a note's own blocks. A source that is missing, moved
// or unreadable is named, with why, never drawn blank. The host fetches the text; the core says what it draws.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dataKind, gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { READ_LIMITS } from '../src/layout-limits.ts';
import { lineInSource, readSource, sourceFor, sourcesOf } from '../src/sources.ts';

const FILE = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;
const note = (...blocks) => `# Trip\n\n${blocks.map((b) => '```gql\n' + b + '\n```').join('\n\ntext between\n\n')}\n`;
const texts = (n) => gqlBlocks(n).map((b) => b.text);
const fromFile = { graph: 'trip', kind: 'file', target: 'Graphs/trip.gql', block: 0 };
const fromNote = { graph: 'trip', kind: 'note', target: 'Trip plan', block: 0 };
const keys = (r) => r.reading.graphs.get('trip').boxes.map((b) => b.key);

describe('a block that draws its graph from a .gql file', () => {
  // proves: gql_file_source
  test('names its graph and the file, and holds no data of its own, so the note never reads it as data', () => {
    const t = texts(note('// graph: trip · FROM Graphs/trip.gql'));
    assert.deepEqual(sourcesOf(t), [fromFile]);
    assert.equal(dataKind(t[0]), null);
    assert.equal(readNote(t).graphs.size, 0);
    assert.deepEqual(readNote(t).problems, []);
  });

  // proves: gql_file_source
  test('names the file the same way written as a link, with or without the brackets, and finds the one for a graph', () => {
    for (const written of ['[[Graphs/trip.gql]]', 'Graphs/trip.gql', '[[Graphs/trip.gql|the trip]]']) {
      const t = texts(note(FILE.replace('// graph: trip', '// graph: other'), `// graph: trip · FROM ${written}`));
      assert.deepEqual(sourceFor(t, 'trip'), { ...fromFile, block: 1 }, written);
      assert.equal(sourceFor(t, 'other'), null);
    }
  });

  // proves: gql_file_source
  test('is drawn from the file as read where it is written: the very graph the file draws as a block', () => {
    const r = readSource(fromFile, { found: 'Graphs/trip.gql', text: FILE });
    assert.equal(r.from, 'Graphs/trip.gql');
    assert.deepEqual(r.reading.graphs.get('trip'), readNote([FILE]).graphs.get('trip'));
    assert.deepEqual(r.reading.problems, []);
  });

  // proves: gql_file_source
  test('draws whatever the file holds when it is read, so a change to the file is drawn and nothing is kept of it', () => {
    const first = readSource(fromFile, { found: 'Graphs/trip.gql', text: FILE });
    const later = readSource(fromFile, {
      found: 'Graphs/trip.gql',
      text: `${FILE},\n(lake:Place {name: 'The lake'}),\n(park)-[:NEAR]->(lake)`,
    });
    assert.deepEqual(keys(first), ['home', 'park']);
    assert.deepEqual(keys(later), ['home', 'park', 'lake']);
  });

  // proves: gql_file_source
  test('goes through the same partial reader: a line that cannot be read is left out and listed at its line in the file', () => {
    const broken = `${FILE},\n(lake:Place {name: 'The lake' oops}),\n(cafe:Place {name: 'Cafe'})`;
    const r = readSource(fromFile, { found: 'Graphs/trip.gql', text: broken });
    assert.deepEqual(keys(r), ['home', 'park', 'cafe']);
    const p = r.reading.problems.find((x) => x.severity === 'error');
    assert.ok(p, 'the line left out is listed');
    assert.equal(lineInSource(r, p), 5, 'the line of the file it is on');
  });

  // proves: gql_file_source
  test('goes through the same limits: a file too large to read is not read, and says which limit', () => {
    const pad = '// padding\n'.repeat(READ_LIMITS.lines + 5);
    const r = readSource(fromFile, { found: 'Graphs/trip.gql', text: `${FILE}\n${pad}` });
    assert.ok(r.reading.tooLarge, 'refused as too large');
    assert.equal(r.reading.graphs.size, 0);
  });

  // proves: gql_file_source
  test('reads a file written with Windows line ends as the same graph', () => {
    const r = readSource(fromFile, { found: 'Graphs/trip.gql', text: FILE.replace(/\n/g, '\r\n') });
    assert.deepEqual(r.reading.graphs.get('trip'), readNote([FILE]).graphs.get('trip'));
  });

  // proves: gql_file_source
  test('a block holding lines of its own beside FROM is a fault, so data is never copied into the note', () => {
    const t = texts(note(`// graph: trip · FROM Graphs/trip.gql\n(home:Place {name: 'Home'})`));
    const [s] = sourcesOf(t);
    assert.match(s.fault, /holds nothing of its own/);
    assert.match(s.fault, /Graphs\/trip\.gql/);
  });

  // proves: gql_file_source
  test('FROM followed by nothing, or by a place that is neither a .gql file nor a note, is a fault saying what may follow', () => {
    const [empty] = sourcesOf(['// graph: trip · FROM']);
    assert.match(empty.fault, /after FROM/);
    const [csv] = sourcesOf(['// graph: trip · FROM data/trip.csv']);
    assert.match(csv.fault, /data\/trip\.csv is neither/);
    const [bad] = sourcesOf(['// graph: my-trip · FROM trip.gql']);
    assert.match(bad.fault, /not one word/);
  });
});

describe('a graph drawn from another note', () => {
  // proves: gql_file_source
  test('names the note by its link, and reads the graph from the blocks the note holds, its lines as the note’s', () => {
    const t = texts(note('// graph: trip · FROM [[Trip plan]]'));
    assert.deepEqual(sourcesOf(t), [fromNote]);
    const other = note('// graph: walk\n(a:Place)', FILE);
    const r = readSource(fromNote, { found: 'Trip plan.md', text: other });
    assert.deepEqual(r.reading.graphs.get('trip'), readNote(texts(other)).graphs.get('trip'));
    const broken = note(`${FILE},\n(lake:Place {name: 'x' oops})`);
    const b = readSource(fromNote, { found: 'Trip plan.md', text: broken });
    const p = b.reading.problems.find((x) => x.severity === 'error');
    assert.equal(lineInSource(b, p), broken.split('\n').indexOf("(lake:Place {name: 'x' oops})") + 1);
  });

  // proves: gql_file_missing
  test('a note that draws the graph from somewhere else itself is named, with where to point FROM instead', () => {
    const r = readSource(fromNote, { found: 'Trip plan.md', text: note('// graph: trip · FROM Graphs/trip.gql') });
    assert.match(r.refused, /The note Trip plan draws graph trip from Graphs\/trip\.gql itself/);
    assert.match(r.refused, /write FROM Graphs\/trip\.gql here/);
  });
});

describe('a missing, moved or unreadable source is named, with why, never drawn blank', () => {
  // proves: gql_file_missing
  test('a missing file is named, and why: nothing is there', () => {
    const r = readSource(fromFile, { missing: true });
    assert.equal(r.why, 'missing');
    assert.equal(r.reading, undefined, 'nothing is drawn');
    assert.match(r.refused, /^The file Graphs\/trip\.gql is not in the vault, so graph trip cannot be drawn from it/);
    assert.match(r.refused, /check the place written after FROM, or put the file back/);
  });

  // proves: gql_file_missing
  test('a moved file is named, and where a file of that name is now, with the place to write after FROM', () => {
    const r = readSource(fromFile, { missing: true, elsewhere: ['Archive/trip.gql'] });
    assert.equal(r.why, 'moved');
    assert.match(
      r.refused,
      /The file Graphs\/trip\.gql is not there any more: a file of that name is at Archive\/trip\.gql/,
    );
    assert.match(r.refused, /If it was moved, write FROM Archive\/trip\.gql in this block/);
    const two = readSource(fromFile, { missing: true, elsewhere: ['A/trip.gql', 'B/trip.gql'] });
    assert.match(two.refused, /files of that name are at A\/trip\.gql and B\/trip\.gql/);
  });

  // proves: gql_file_missing
  test('an unreadable file is named, with the reason it could not be read', () => {
    const r = readSource(fromFile, { found: 'Graphs/trip.gql', unreadable: 'permission denied' });
    assert.equal(r.why, 'unreadable');
    assert.match(r.refused, /The file Graphs\/trip\.gql could not be read \(permission denied\)/);
  });

  // proves: gql_file_missing
  test('a file with no graph line, or holding no graph of that name, says so and what it holds', () => {
    const bare = readSource(fromFile, { found: 'Graphs/trip.gql', text: "(home:Place {name: 'Home'})" });
    assert.equal(bare.why, 'no-graph');
    assert.match(bare.refused, /does not start with a graph line: write \/\/ graph: trip as its first line/);
    const other = readSource(fromFile, { found: 'Graphs/trip.gql', text: FILE.replace('graph: trip', 'graph: walk') });
    assert.equal(other.why, 'no-graph');
    assert.match(other.refused, /The file Graphs\/trip\.gql holds no graph called trip: it holds walk/);
    const none = readSource(fromNote, { found: 'Trip plan.md', text: '# Nothing here\n' });
    assert.match(none.refused, /The note Trip plan holds no graph at all/);
  });

  // proves: gql_file_missing
  test('a missing note is named as a note, by its link', () => {
    const r = readSource(fromNote, { missing: true });
    assert.match(r.refused, /^The note Trip plan is not in the vault, so graph trip cannot be drawn from it/);
    assert.match(r.refused, /or put the note back/);
  });
});

describe('a source is a place inside the vault, and never read when too large', () => {
  // proves: gql_file_source
  for (const [why, place] of [
    ['a leading slash', '/etc/trip.gql'],
    ['a leading backslash', '\\\\server\\trip.gql'],
    ['a drive letter', 'D:/Graphs/trip.gql'],
    ['a drive letter with no slash', 'c:trip.gql'],
    ['a .. part', 'Graphs/../../trip.gql'],
    ['a .. part between backslashes', 'Graphs\\..\\trip.gql'],
    ['a .. part in a note link', '[[../Secret]]'],
    ['a part starting with a dot', '.obsidian/trip.gql'],
    ['a hidden folder further in', 'Graphs/.hidden/trip.gql'],
  ])
    test(`FROM a place with ${why} is refused, naming it`, () => {
      const [s] = sourcesOf([`// graph: trip · FROM ${place}`]);
      assert.ok(s.fault, `${place} is refused`);
      assert.match(s.fault, /is not a place inside the vault: write its path from the vault’s root/);
    });

  // proves: gql_file_source
  test('a place inside the vault, folders and all, is not refused', () => {
    const [s] = sourcesOf(['// graph: trip · FROM Graphs/Trips 2026/trip.v2.gql']);
    assert.deepEqual(s, { graph: 'trip', kind: 'file', target: 'Graphs/Trips 2026/trip.v2.gql', block: 0 });
  });

  // proves: gql_file_source
  test('a file the host found too large is not read, and says which limit, as a note’s blocks are not', () => {
    const r = readSource(fromFile, { found: 'Graphs/trip.gql', tooLarge: READ_LIMITS.bytes + 1 });
    assert.deepEqual(r.reading.tooLarge, {
      reason: 'too-large',
      limit: 'text-bytes',
      count: READ_LIMITS.bytes + 1,
      most: READ_LIMITS.bytes,
    });
    assert.equal(r.reading.graphs.size, 0);
  });
});
