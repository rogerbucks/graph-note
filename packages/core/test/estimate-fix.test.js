// An estimated link's fix (spec §3, estimate_never_written; device check V-06, Roger, 11 Oct 2026: "I can't click on
// the estimated link to review it / edit it / fix it. Make that simple"): accepting an estimate is its problem's own
// fix, the one the editor's fix bar offers, found where the misspelt word is written so the editor can select it there.
// The module is imported in each test, so a test fails on its own when it is missing, rather than the whole file.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { diagnostics } from '../src/help.ts';

const BASE = `// graph: reader
(question:Question {title: 'Which device?'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader:Option {name: 'Large reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(small_reader)-[:ANSWERS]->(question),
(large_reader)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large_reader)`;

const fixOf = async (...args) => (await import('../src/estimate-fix.ts')).estimateFix(...args);

/** The text with one fix's edits made, as an editor makes an LSP edit. */
function applied(text, fix) {
  const lines = text.split('\n');
  const at = (p) => lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
  return Object.values(fix.edit.changes)
    .flat()
    .sort((a, b) => at(b.range.start) - at(a.range.start))
    .reduce((t, e) => t.slice(0, at(e.range.start)) + e.newText + t.slice(at(e.range.end)), text);
}

describe('accepting an estimate', () => {
  test('a misspelt name’s estimate is accepted by its problem’s own fix: the name changed to the one it was taken to mean', async () => {
    const text = BASE + ',\n(eyes)-[:FAVOURS]->(small_reeder)';
    const reading = readNote([text]);
    const found = await fixOf(reading, 'reader', 0, text, 'note');
    assert.ok(found, 'a fix is offered');
    assert.equal(found.fix.title, 'Change small_reeder to small_reader');
    const [own] = diagnostics(reading, 'reader', 0, text, 'note').flatMap((d) => d.data.fixes);
    assert.deepEqual(found.fix, own, 'the very fix the fix bar offers');
    assert.equal(applied(text, found.fix), BASE + ',\n(eyes)-[:FAVOURS]->(small_reader)', 'every other byte kept');
  });

  test('a relationship type’s estimate is accepted the same way', async () => {
    const text = BASE + ',\n(eyes)-[:FAVOURS]->(small_reader),\n(eyes)-[:FAVORS]->(question)';
    const reading = readNote([text]);
    const n = reading.graphs.get('reader').estimates.findIndex((e) => e.kind === 'type');
    assert.ok(n >= 0, 'FAVORS is estimated as FAVOURS');
    const found = await fixOf(reading, 'reader', n, text, 'note');
    assert.equal(found.fix.title, 'Change FAVORS to FAVOURS');
    assert.equal(applied(text, found.fix), text.replace('[:FAVORS]', '[:FAVOURS]'));
  });

  test('it says where the misspelt word is written, so the editor can select it there', async () => {
    const text = BASE + ',\n(eyes)-[:FAVOURS]->(small_reeder)';
    const found = await fixOf(readNote([text]), 'reader', 0, text, 'note');
    const lines = text.split('\n'),
      { start, end } = found.range;
    assert.equal(start.line, lines.length - 1);
    assert.equal(lines[start.line].slice(start.character, end.character), 'small_reeder');
    assert.equal(found.block, 0);
  });

  // review of #85: the fix took the first match of the word on its line, even inside quotes or in another link
  test('the name is changed where the link names it, never where a text on its line says it', async () => {
    const line = "(eyes)-[:FAVOURS {why: 'small_reeder'}]->(small_reeder)";
    const text = `${BASE},\n${line}`;
    const reading = readNote([text]);
    const found = await fixOf(reading, 'reader', 0, text, 'note');
    assert.equal(applied(text, found.fix), `${BASE},\n(eyes)-[:FAVOURS {why: 'small_reeder'}]->(small_reader)`);
    assert.equal(found.range.start.character, line.lastIndexOf('small_reeder'), 'Edit the link selects that word');
    const on = found.range.start.line;
    const [bar] = diagnostics(reading, 'reader', 0, text, 'note').filter((d) => d.range.start.line === on);
    assert.deepEqual(bar.range, found.range, 'and the fix bar offers its fix there');
  });

  test('two links on one line misspelling the same name are each fixed at their own place', async () => {
    const line = '(eyes)-[:FAVOURS]->(small_reeder), (question)-[:ANSWERS]->(small_reeder)';
    const text = `${BASE},\n${line}`;
    const reading = readNote([text]);
    assert.equal(reading.graphs.get('reader').estimates.length, 2);
    const first = await fixOf(reading, 'reader', 0, text, 'note'),
      second = await fixOf(reading, 'reader', 1, text, 'note');
    assert.equal(applied(text, first.fix), `${BASE},\n${line.replace('small_reeder', 'small_reader')}`);
    const at = line.lastIndexOf('small_reeder');
    assert.equal(applied(text, second.fix), `${BASE},\n${line.slice(0, at)}small_reader)`);
    assert.equal(second.range.start.character, at, 'Edit the link selects the second link’s word');
    const bar = diagnostics(reading, 'reader', 0, text, 'note').map((d) => d.range.start.character);
    assert.deepEqual(bar, [line.indexOf('small_reeder'), at], 'the fix bar offers each at its own word');
  });

  test('with both ends misspelt, one press changes both, as the sentence says', async () => {
    const text = `${BASE},\n(eyez)-[:FAVOURS]->(smal_readr)`;
    const reading = readNote([text]);
    const [e] = reading.graphs.get('reader').estimates;
    assert.match(e.explain, /To fix it, change eyez to eyes and smal_readr to small_reader\.$/);
    const found = await fixOf(reading, 'reader', 0, text, 'note');
    assert.equal(found.fix.title, 'Change eyez to eyes and smal_readr to small_reader');
    assert.equal(applied(text, found.fix), `${BASE},\n(eyes)-[:FAVOURS]->(small_reader)`);
  });

  test('no fix is offered for a text that is not the block the estimate is written in, so nothing is written blind', async () => {
    const text = BASE + ',\n(eyes)-[:FAVOURS]->(small_reeder)';
    const reading = readNote([text]);
    assert.equal(await fixOf(reading, 'reader', 0, text + ',\n(eyes)-[:FAVOURS]->(question)', 'note'), null);
    assert.equal(await fixOf(reading, 'reader', 5, text, 'note'), null, 'nor for an estimate there is not');
    assert.equal(await fixOf(reading, 'nowhere', 0, text, 'note'), null, 'nor for a graph there is not');
  });
});
