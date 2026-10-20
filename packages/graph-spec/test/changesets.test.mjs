// A change set's author comes from the session that sent it, never from the name in its header (editor spec §51,
// spec_author_from_session; GS4). The host says who the session is. A header naming anyone else fails the check, and
// the set is still checked and recorded as the session's. So a model cannot sign a change as a person.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('../src/graph-spec-check.js');
const table = JSON.parse(readFileSync(fileURLToPath(new URL('./change-cases.json', import.meta.url)), 'utf8'));

// the same library as change-cases.json: ada is a Person, bot is a Model
const base = [[...table.head, ...table.base_rest].join('\n')];
const now = C.canon(C.worldFromStore(C.read(base)).library).slice(0, 16);
const SESSION = 'its author is the session that sent it, not a name written in its header (editor spec §51)';
const setBy = (by, ...body) =>
  [`// graph: library · CHANGE SET cs · against sha-256-64:${now} · by ${by}`, ...body].join('\n');
const failed = (r) => r.results.filter(([, ok]) => !ok).map(([label]) => label);

describe('the author of a change set is the session that sent it', () => {
  test("a model's change set that names a person in its header is still recorded as the model's", () => {
    const r = C.checkChangeset(base, setBy('ada', "(late:Book {title: 'A late book'})"), {}, new Set(), 'bot');
    assert.equal(r.header.by, 'bot');
    assert.equal(r.header.claimed, 'ada');
    assert.ok(failed(r).includes(SESSION), 'the header that names someone else fails the check');
  });

  test('it is checked as the model it is: an assessment it signs as the person is refused', () => {
    const set = setBy('ada', "(guess:Assessment {likelihood: 'likely'}),", '(guess)-[:BY]->(ada)');
    assert.ok(!failed(C.checkChangeset(base, set, {})).includes("a model's assessments are its own"));
    assert.ok(failed(C.checkChangeset(base, set, {}, new Set(), 'bot')).includes("a model's assessments are its own"));
  });

  test('a header that names the session itself passes, and says so', () => {
    const r = C.checkChangeset(base, setBy('bot', "(late:Book {title: 'A late book'})"), {}, new Set(), 'bot');
    assert.deepEqual(failed(r), []);
    assert.ok(r.results.some(([label, ok]) => label === SESSION && ok));
    assert.equal(r.header.by, 'bot');
    assert.equal(r.header.claimed, undefined);
  });

  test('with no session given, the check is as it was: the header names the author', () => {
    const r = C.checkChangeset(base, setBy('ada', "(late:Book {title: 'A late book'})"), {});
    assert.equal(r.header.by, 'ada');
    assert.ok(!r.results.some(([label]) => label === SESSION));
  });
});
