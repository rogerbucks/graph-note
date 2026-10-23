// A thing renamed across notes (editor spec §27, rename_follows_notes; risk NEURO-10): rename-across.ts. A graph
// written in blocks of two notes has its thing renamed in both, as one bundle for a person to apply. A note that
// cannot be read is listed, and so is every note when the new name is taken. Nothing else in the text moves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renameAcross } from '../src/rename-across.ts';
import { readNote } from '../src/drawing.ts';
import { gqlBlocks } from '../src/fences.ts';
import { MeshHistory } from '../src/mesh-history.ts';

const note = (title, body) => [`# ${title}`, '', '```gql', ...body, '```', ''].join('\n');
const PARTS = note('Parts', ['// graph: shop', "(bolt:Part {name: 'Bolt'}),", "(nut:Part {name: 'Nut'})"]);
const USES = note('Uses', [
  '// graph: shop',
  "(widget:Product {name: 'Widget'}),",
  '(widget)-[:USES]->(bolt),',
  "(spare:Part {id: 'bolt_two', name: 'Spare bolt'})",
  'SET bolt.size = 6',
]);
const OTHER = note('Other', ['// graph: tools', "(bolt:Tool {name: 'Bolt cutter'})"]);
const keysOf = (text, graph) =>
  readNote(gqlBlocks(text).map((b) => b.text))
    .graphs.get(graph)
    ?.boxes.map((b) => b.key);

describe('rename_follows_notes', () => {
  test('a thing drawn from two notes is renamed in both, and in no other graph', () => {
    const { changes, listed } = renameAcross(
      { 'parts.md': PARTS, 'uses.md': USES, 'other.md': OTHER },
      'shop',
      'bolt',
      'm6_bolt',
    );
    assert.deepEqual(Object.keys(changes).sort(), ['parts.md', 'uses.md']);
    assert.deepEqual(listed, []);
    assert.match(changes['parts.md'], /\(m6_bolt:Part \{name: 'Bolt'\}\)/);
    assert.match(changes['uses.md'], /\(widget\)-\[:USES\]->\(m6_bolt\)/);
    assert.match(changes['uses.md'], /SET m6_bolt\.size = 6/);
    assert.match(changes['uses.md'], /id: 'bolt_two'/, 'a name that only starts the same is kept');
    assert.ok(keysOf(changes['parts.md'], 'shop').includes('m6_bolt'));
  });

  test('only the names change: every other line is kept byte for byte', () => {
    const { changes } = renameAcross({ 'uses.md': USES }, 'shop', 'bolt', 'm6_bolt');
    const before = USES.split('\n'),
      after = changes['uses.md'].split('\n');
    assert.equal(after.length, before.length);
    assert.deepEqual(
      after.filter((l, i) => l !== before[i]),
      ['(widget)-[:USES]->(m6_bolt),', 'SET m6_bolt.size = 6'],
    );
  });

  test('an id written as text follows too', () => {
    const IDED = note('Ided', ['// graph: shop', "(b:Part {id: 'bolt', name: 'Bolt'})"]);
    assert.match(renameAcross({ 'a.md': IDED }, 'shop', 'bolt', 'm6').changes['a.md'], /id: 'm6'/);
  });

  test('a note that cannot be read is listed to fix by hand, never rewritten blind', () => {
    const BROKEN = note('Broken', ['// graph: shop', '(bolt:Part) @oops']);
    const { changes, listed } = renameAcross({ 'parts.md': PARTS, 'broken.md': BROKEN }, 'shop', 'bolt', 'm6');
    assert.deepEqual(Object.keys(changes), ['parts.md']);
    assert.deepEqual(listed, [{ note: 'broken.md', why: 'unreadable' }]);
  });

  test('a new name the graph already has rewrites nothing and lists each note', () => {
    const { changes, listed } = renameAcross({ 'parts.md': PARTS, 'uses.md': USES }, 'shop', 'bolt', 'nut');
    assert.deepEqual(changes, {});
    assert.deepEqual(listed, [
      { note: 'parts.md', why: 'taken' },
      { note: 'uses.md', why: 'taken' },
    ]);
  });

  test('a name that is not a plain name changes nothing', () => {
    assert.deepEqual(renameAcross({ 'parts.md': PARTS }, 'shop', 'bolt', 'm6 bolt'), { changes: {}, listed: [] });
  });

  test('the rename is applied as one bundle, logged with who applied it', () => {
    const history = new MeshHistory(() => '2026-10-23T12:00:00Z');
    const { changes } = renameAcross({ 'parts.md': PARTS, 'uses.md': USES }, 'shop', 'bolt', 'm6_bolt');
    const entry = history.bundle('rename bolt', changes, 'Roger');
    assert.deepEqual(entry.notes, ['parts.md', 'uses.md']);
    assert.equal(history.log().filter((e) => e.kind === 'bundle').length, 1);
  });
});
