// A thing's details open with what is going on, in a sentence or two (editor spec §25, details_said): what it is, what
// links to it and what it links to, naming up to two things in a group and counting more, then how many properties and
// problems it has. Host-free: the plugin puts the sentence at the top of the panel.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { thingSaid } from '../src/details-said.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';
import { isPseudoWord } from '../src/pseudo-words.ts';

afterEach(() => setLanguage(SOURCE_LANGUAGE));

const TEAM = `// graph: team · SOURCE
(ann:Person {name: 'Ann', role: 'Lead'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(eve:Person {name: 'Eve'}),
(bob)-[:REPORTS_TO]->(ann),
(cy)-[:REPORTS_TO]->(ann),
(eve)-[:REPORTS_TO]->(ann),
(ann)-[:REPORTS_TO]->(dee),
(dee)-[:MENTORS]->(bob)`;

describe('the sentence at the top of a thing’s details', () => {
  const reading = readNote([TEAM]);

  test('says what the thing is and how it is linked, counting a group of more than two things', () => {
    assert.equal(
      thingSaid(reading, 'team', 'ann'),
      'This person reports to ‘Dee’ and is reported to by 3 things. It has 2 properties and no problems.',
    );
  });

  test('names the things of a group of one or two, each in quotes', () => {
    assert.equal(
      thingSaid(reading, 'team', 'dee'),
      'This person mentors ‘Bob’ and is reported to by ‘Ann’. It has 1 property and no problems.',
    );
  });

  test('a name that ends in its own stop never ends the sentence', () => {
    const r = readNote([
      "// graph: g · SOURCE\n(a:Option {name: 'Large'}),\n(q:Question {name: 'Which?'}),\n(a)-[:ANSWERS]->(q)",
    ]);
    assert.match(thingSaid(r, 'g', 'a'), /^This option answers ‘Which\?’\. It has/);
  });

  test('says when a thing has no links yet', () => {
    const r = readNote(["// graph: g · SOURCE\n(a:Idea {name: 'Alone'})"]);
    assert.equal(thingSaid(r, 'g', 'a'), 'This idea has no links yet. It has 1 property and no problems.');
  });

  test('a link in with no reading back says who links to it in a sentence of its own', () => {
    const r = readNote(["// graph: g · SOURCE\n(a:X {name: 'A'}),\n(b:X {name: 'B'}),\n(a)-[:PART_OF_PLAN]->(b)"]);
    assert.equal(thingSaid(r, 'g', 'b'), '‘A’ part of plan this. It has 1 property and no problems.');
  });

  test('a kind written in capitals keeps them', () => {
    const r = readNote(["// graph: g · SOURCE\n(a:API {name: 'Pay'})"]);
    assert.match(thingSaid(r, 'g', 'a'), /^This API has no links yet\./);
  });

  test('counts the problems on it', () => {
    const r = readNote(["// graph: g · SOURCE\n(a:X {name: 'A'}),\n(a)-[:LINKS]->(nobody)"]);
    assert.match(thingSaid(r, 'g', 'a'), /It has 1 property and 1 problem\.$/);
  });

  test('is said in the reader’s language', () => {
    setLanguage('en-XA');
    assert.ok(isPseudoWord(thingSaid(reading, 'team', 'ann').split('. ')[1]));
  });

  test('says nothing for a thing the graph does not hold', () => {
    assert.equal(thingSaid(reading, 'team', 'zed'), '');
  });
});
