// Strictness (editor spec §21, strictness_levels, simplified_back_to_standard, engines_get_standard):
// - the departures from standard GQL the reader reads as meant, and what each of the three levels makes of them;
// - converting a note back to standard GQL, checked before it is written;
// - the standard text an engine or an export is given, whatever the level.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { gqlBlocks } from '../src/blocks.ts';
import { DEPARTURES, underStrictness, toStandard, standardBlocks } from '../src/strictness.ts';

const fence = (body) => '```gql\n' + body + '\n```';
// a missing comma on line 2, and on line 5 a link type written without its colon, once the graph has the type
const SLIPS = "// graph: g\n(a:T {text: 'A'})\n(b:T {text: 'B'}),\n(b)-[:KNOWS]->(a),\n(a)-[KNOWS]->(b)";
const NOTE = `# A note\n\nSome words.\n\n${fence(SLIPS)}\n\nMore words.\n`;
const problemsOf = (note) => readNote(gqlBlocks(note).map((b) => b.text)).problems;

describe('the departures from standard GQL', () => {
  test('are the three slips the reader reads as meant: a missing comma, a comma with nothing after it, a type without its colon', () => {
    assert.deepEqual(
      DEPARTURES.map((d) => d.id),
      ['missing-comma', 'trailing-comma', 'bare-type'],
    );
    for (const d of DEPARTURES) {
      assert.ok(d.name, `${d.id} has a name`);
      assert.match(d.sentence, /\.$/, `${d.id} has a sentence saying what is allowed`);
    }
  });

  test('each problem the reader reports for one says which departure it is', () => {
    const departures = problemsOf(NOTE).map((p) => p.departure);
    assert.deepEqual(departures.filter(Boolean).sort(), ['bare-type', 'missing-comma']);
    const trailing = problemsOf(fence("// graph: g\n(a:T {text: 'A'}),"));
    assert.deepEqual(
      trailing.map((p) => p.departure),
      ['trailing-comma'],
    );
  });
});

describe('the three levels', () => {
  const problems = problemsOf(NOTE);

  test('Forgiving, the default, reads a slip, reports it as a warning and offers its fix', () => {
    const seen = underStrictness(problems, { strictness: 'forgiving', allowed: [] });
    assert.deepEqual(seen, problems);
    for (const p of seen.filter((x) => x.departure)) {
      assert.equal(p.severity, 'warning');
      assert.ok(p.fix);
    }
  });

  test('Standard makes every departure from standard GQL an error, saying so, and keeps its fix', () => {
    const seen = underStrictness(problems, { strictness: 'standard', allowed: ['missing-comma'] });
    const departures = seen.filter((p) => p.departure);
    assert.equal(departures.length, 2, 'what Simplified allows is still an error in Standard');
    for (const p of departures) {
      assert.equal(p.severity, 'error');
      assert.match(p.message, /not standard GQL/);
      assert.ok(p.fix);
    }
  });

  test('Simplified allows the departures chosen on the page as written, and reports the rest as Forgiving does', () => {
    const seen = underStrictness(problems, { strictness: 'simplified', allowed: ['missing-comma'] });
    assert.deepEqual(
      seen.filter((p) => p.departure).map((p) => [p.departure, p.severity]),
      [['bare-type', 'warning']],
    );
  });

  test('a problem that is no departure is the same at every level', () => {
    const broken = problemsOf(fence("// graph: g\n(a:T {text: 'A'}),\n(b:T {text: })"));
    const other = broken.filter((p) => !p.departure);
    assert.ok(other.length);
    for (const strictness of ['standard', 'forgiving', 'simplified'])
      assert.deepEqual(
        underStrictness(broken, { strictness, allowed: ['missing-comma', 'trailing-comma', 'bare-type'] }).filter(
          (p) => !p.departure,
        ),
        other,
      );
  });
});

describe('converting a note back to standard GQL', () => {
  test('writes each departure as standard GQL, and leaves every other byte of the note as it was', () => {
    const r = toStandard(NOTE);
    assert.equal(r.ok, true, r.reason);
    const want = "// graph: g\n(a:T {text: 'A'}),\n(b:T {text: 'B'}),\n(b)-[:KNOWS]->(a),\n(a)-[:KNOWS]->(b)";
    assert.equal(r.note, NOTE.replace(SLIPS, want));
    assert.equal(r.changed, 2);
  });

  test('takes out a comma with nothing after it', () => {
    const r = toStandard(fence("// graph: g\n(a:T {text: 'A'}),\n// next"));
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.note, fence("// graph: g\n(a:T {text: 'A'})\n// next"));
  });

  test('is checked by the standard checker before it is written: the converted note departs nowhere and reads the same graph', () => {
    const r = toStandard(NOTE);
    assert.deepEqual(
      problemsOf(r.note).filter((p) => p.departure),
      [],
    );
    const graph = (note) => {
      const g = readNote(gqlBlocks(note).map((b) => b.text)).world.g;
      return JSON.stringify([[...g.nodes], g.edges]);
    };
    assert.equal(graph(r.note), graph(NOTE));
  });

  test('a note that cannot be made standard is left as it is, and says why', () => {
    const r = toStandard(fence("// graph: g\n(a:T {text: 'A'})\n(b:T {text: })"));
    assert.equal(r.ok, false);
    assert.match(r.reason, /line 3/);
    assert.equal(r.note, undefined);
  });

  test('a note that is already standard is left as it is', () => {
    const note = fence("// graph: g\n(a:T {text: 'A'})");
    assert.deepEqual(toStandard(note), { ok: true, note, changed: 0 });
  });
});

describe('what an engine or an export is given', () => {
  // the level is never asked: it decides what is reported, and nothing of what is given
  test('is standard GQL, each block as converted, with no line added, and nothing left departing', () => {
    const blocks = gqlBlocks(NOTE).map((b) => b.text);
    const want = gqlBlocks(toStandard(NOTE).note).map((b) => b.text);
    const given = standardBlocks(blocks);
    assert.deepEqual(given, { blocks: want, left: [] });
    assert.equal(given.blocks[0].split('\n').length, blocks[0].split('\n').length);
  });
});

describe('converting a note of several blocks', () => {
  test('each block is converted in its own place, and the note as written is checked whole', () => {
    const twice = `${fence(SLIPS)}\n\nBetween.\n\n${fence(SLIPS.replace('graph: g', 'graph: h'))}\n`;
    const r = toStandard(twice);
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.changed, 4);
    assert.deepEqual(
      problemsOf(r.note).filter((p) => p.departure),
      [],
    );
  });
});
