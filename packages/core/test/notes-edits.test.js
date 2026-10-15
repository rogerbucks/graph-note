// Notes and the editor's edits (editor spec §24, note_kept_by_edits, note_add): every edit the editor makes keeps a
// thing's `///` note with it and takes the note away with the thing, and undo restores both; and `setNote` adds, changes
// and removes a note by writing the comment lines above its thing or link, nothing else in the block changing.
// Every edit entry point of the core is swept, listed in SWEPT: a new one is added there with its case.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { renamedLinks, applyChanges } from '../src/link-renames.ts';
import { setProperty, renameProperty } from '../src/inspector.ts';
import { addThing } from '../src/add-thing.ts';
import { makeList, addToList, removeFromList } from '../src/linked-list.ts';
import { parkForLater } from '../src/deferred.ts';
import { pathBlock } from '../src/paths.ts';
import { removal } from '../src/path-edits.ts';
import { applyChange } from '../src/proposals-apply.ts';
import { styleEdit } from '../src/style-edit.ts';
import { lockBlock } from '../src/lock.ts';
import { PaneSession } from '../src/pane.ts';
import { setNote } from '../src/note-edit.ts';

const GRAPH = 'trip';
const TRIP = `// graph: trip
/// The **start** of the trip.
///
/// Packed already.
//@ colour: orange
(start:Place {name: 'Start'}),
/// Halfway.
(mid:Place {name: 'Middle', stops: 'Bath'}),
(end:Place {name: 'End'}),
/// Why we go.
(start)-[:TO]->(mid),
(mid)-[:TO]->(end)`;
const START = 'The **start** of the trip.\n\nPacked already.';
const NOTES = { things: { start: START, mid: 'Halfway.' }, links: ['start TO mid: Why we go.'] };
const fence = (t) => '```gql\n' + t + '\n```';
const NOTE = ['# Trip', '', fence(TRIP), '', 'After.', ''].join('\n');

/** The notes a block draws: each thing's by its key, each link's by its ends. */
function notesOf(text) {
  const g = readNote([text]).graphs.get(GRAPH);
  return {
    things: Object.fromEntries(g.boxes.filter((b) => b.note).map((b) => [b.key, b.note.text])),
    links: g.links.filter((l) => l.note).map((l) => `${l.from} ${l.type} ${l.to}: ${l.note.text}`),
  };
}
const without = (o, key) => ({ ...o, things: Object.fromEntries(Object.entries(o.things).filter(([k]) => k !== key)) });
const done = (r) => {
  assert.equal(r.ok, true, 'refused: ' + (r.reason ?? ''));
  return r.text;
};

describe('note_add: setNote writes the comment lines above a thing or a link', () => {
  test('adds a note above a thing written on a line of its own, with that line’s indent, and reads back as written', () => {
    const block = "// graph: trip\n(a:T {name: 'A'}),\n    (b:T {name: 'B'})";
    const text = done(setNote(block, { thing: 'b' }, 'Second **one**.\n\nWith a paragraph.'));
    assert.equal(
      text,
      "// graph: trip\n(a:T {name: 'A'}),\n    /// Second **one**.\n    ///\n    /// With a paragraph.\n    (b:T {name: 'B'})",
    );
    assert.deepEqual(notesOf(text).things, { b: 'Second **one**.\n\nWith a paragraph.' });
  });

  test('adds a note to a link, counted among the links written in the block', () => {
    const text = done(setNote(TRIP, { link: 1 }, 'The last leg.'));
    assert.deepEqual(notesOf(text), { ...NOTES, links: [...NOTES.links, 'mid TO end: The last leg.'] });
    assert.equal(text.split('\n').filter((l) => l.includes('/// The last leg.')).length, 1);
  });

  test('changes a note: its lines are replaced where they were, the //@ line and every other byte kept', () => {
    const text = done(setNote(TRIP, { thing: 'start' }, 'Gone **north**.'));
    assert.deepEqual(notesOf(text), { ...NOTES, things: { ...NOTES.things, start: 'Gone **north**.' } });
    assert.ok(text.includes('//@ colour: orange\n(start:'), 'the tag stays directly above the thing');
    assert.equal(text.replace('/// Gone **north**.\n', ''), TRIP.replace(/\/\/\/.*\n(\/\/\/\n)?\/\/\/ Packed already\.\n/, ''));
  });

  test('removes a note with null, or with a text of nothing but whitespace; adding then removing gives back the bytes', () => {
    const removed = done(setNote(TRIP, { thing: 'mid' }, null));
    assert.deepEqual(notesOf(removed), without(NOTES, 'mid'));
    assert.equal(done(setNote(TRIP, { thing: 'mid' }, ' \n \n')), removed);
    const plain = done(setNote(TRIP, { thing: 'end' }, 'Journey’s end.'));
    assert.equal(done(setNote(plain, { thing: 'end' }, null)), TRIP);
  });

  test('a text’s trailing spaces and blank ends are not written, and a //-looking line is written as it is', () => {
    const text = done(setNote(TRIP, { thing: 'end' }, '\nSee // here   \n\n'));
    assert.ok(text.includes('/// See // here\n(end:'));
    assert.deepEqual(notesOf(text).things.end, 'See // here');
  });

  test('is refused, with the reason and nothing written, where the note would belong to none or to no thing', () => {
    const shared = '// graph: trip\n(a:T), (b:T)';
    for (const [block, target, why] of [
      [shared, { thing: 'a' }, /line of its own/],
      [TRIP, { thing: 'nobody' }, /not written in this block/],
      [TRIP, { link: 9 }, /no link number 10/],
      ['// graph: trip\n(a:T)-[:R]->(b:T)', { thing: 'a' }, /line of its own/],
    ]) {
      const r = setNote(block, target, 'A note.');
      assert.equal(r.ok, false, JSON.stringify(target));
      assert.match(r.reason, why);
    }
  });

  test('undo takes the note away or brings it back, with the block’s other bytes untouched', () => {
    const s = new PaneSession(NOTE, 2);
    s.edit(done(setNote(s.text, { thing: 'end' }, 'Journey’s end.')));
    const w = s.write(NOTE);
    assert.equal(w.ok, true);
    assert.match(w.note, /\/\/\/ Journey’s end\.\n\(end:/);
    assert.equal(s.undo(w.note).note, NOTE);
    assert.match(s.redo(NOTE).note, /\/\/\/ Journey’s end\./);
  });
});

/** The edits that change a block without taking a thing out, each run on TRIP and read back: `entry` is the function swept. */
const reading = readNote([TRIP]);
const SHAPE = { rel: 'HAS', kind: 'Stop' };
const change = (c) => ({ id: 'c1', group: 'g', ...c });
const KEPT = [
  ['setProperty', 'sets a property', () => done(setProperty(TRIP, GRAPH, { thing: 'mid' }, 'name', "'Halfway house'"))],
  ['setProperty', 'removes a property', () => done(setProperty(TRIP, GRAPH, { thing: 'mid' }, 'stops', null))],
  ['setProperty', 'sets a link’s property', () => done(setProperty(TRIP, GRAPH, { link: 0 }, 'weight', '2'))],
  ['renameProperty', 'renames a property', () => done(renameProperty(TRIP, GRAPH, { thing: 'mid' }, 'stops', 'halts'))],
  ['addThing', 'adds a thing', () => addThing(reading, GRAPH, TRIP, { text: 'Journey', kind: 'Place' }).text],
  ['makeList', 'makes a list', () => makeList(TRIP, reading, GRAPH, 'mid', 'stops', SHAPE).text],
  ['addToList', 'adds to a list', () => addToList(TRIP, reading, GRAPH, 'mid', SHAPE, 'Wells').text],
  [
    'parkForLater',
    'parks a thing for later',
    () => parkForLater(TRIP, 'end', { what: 'a permit', why: 'the queue' }, reading),
  ],
  ['pathBlock', 'records a walked path', () => pathBlock(reading, GRAPH, TRIP, 'Day one', ['start', 'mid']).text],
  [
    'applyChange',
    'adds a thing, as a proposal does',
    () => applyChange([TRIP], GRAPH, change({ op: 'add', gql: "(x:Place {name: 'X'})" })).texts[0],
  ],
  [
    'applyChange',
    'sets a property, as a proposal does',
    () => applyChange([TRIP], GRAPH, change({ op: 'set', thing: 'end', key: 'name', value: "'Finish'" })).texts[0],
  ],
  [
    'styleEdit',
    'nudges a thing, in the style graph, never the data',
    () => {
      const r = styleEdit(NOTE, GRAPH, { nudge: { word: 'beside', thing: 'start', other: 'end' } });
      assert.ok(r.note, r.refused);
      return r.note.split('```gql\n')[1].split('\n```')[0];
    },
  ],
  [
    'lockBlock',
    'locks the graph, writing a schema block after it',
    () => {
      const schema = lockBlock(reading, GRAPH, '2026-10-16');
      assert.ok(schema.includes('ElementType'));
      return TRIP;
    },
  ],
  [
    'renamedLinks',
    'follows a renamed note in a property',
    () => {
      const note = fence(TRIP.replace("name: 'Start'", "name: 'Start', see: '[[Old trip]]'")),
        changes = renamedLinks(note, 'Old trip.md', 'New trip.md');
      assert.equal(changes.length, 1);
      return applyChanges(note, changes).split('```gql\n')[1].split('\n```')[0];
    },
  ],
];
const SWEPT = [...new Set(KEPT.map((k) => k[0]))];

describe('note_kept_by_edits: an edit that takes nothing out leaves every note on the thing it was on', () => {
  for (const [entry, what, run] of KEPT)
    test(`${entry} ${what}`, () => {
      const text = run();
      assert.notEqual(text, undefined);
      assert.deepEqual(notesOf(text), NOTES);
    });

  test('every note line of the block is still in the text, whole, after each of these edits', () => {
    for (const [entry, , run] of KEPT) {
      const text = run();
      for (const line of TRIP.split('\n').filter((l) => l.startsWith('/// ') || l.startsWith('//@')))
        assert.ok(text.includes(line), `${entry} kept ${line}`);
    }
  });

  test('the sweep names the entry points it covers: edits of properties, lists, deferral, paths, proposals, style, lock and renames', () => {
    assert.deepEqual(SWEPT, [
      'setProperty',
      'renameProperty',
      'addThing',
      'makeList',
      'addToList',
      'parkForLater',
      'pathBlock',
      'applyChange',
      'styleEdit',
      'lockBlock',
      'renamedLinks',
    ]);
  });
});

const PATHS = `// graph: trip
(tour:Path {title: 'Day'}),
(start:Place {name: 'S'}),
(mid:Place {name: 'M'}),
(end:Place {name: 'E'}),
/// First step.
(tour)-[:STEP {seq: 1}]->(start),
/// Second step.
(tour)-[:STEP {seq: 2}]->(mid),
(tour)-[:STEP {seq: 3}]->(end)`;
const LISTED = `// graph: trip
(mid:Place {name: 'Middle'}),
/// Bath is lovely.
(bath:Stop {name: 'Bath'}),
/// Mid has it.
(mid)-[:HAS]->(bath),
(wells:Stop {name: 'Wells'}),
(mid)-[:HAS]->(wells)`;
const LAST = `// graph: trip
(a:T {name: 'A'}),
/// About b.
(b:T {name: 'B'}),
/// A to b.
(a)-[:R]->(b)`;

/** The edits of a removal's fix, as the editor applies them: the replaced word and each `also`, last place first. */
function fixed(block, line, dropped) {
  const r = removal(block, line, dropped);
  const edits = [{ span: r.span, text: r.replace.with[0] }, ...r.also];
  const lines = block.split('\n');
  for (const e of edits.sort((a, b) => b.span.line - a.span.line || b.span.character - a.span.character)) {
    const l = lines[e.span.line];
    lines[e.span.line] = l.slice(0, e.span.character) + e.text + l.slice(e.span.end);
  }
  return lines.join('\n');
}

describe('note_kept_by_edits: an edit that takes a thing or link out takes its note with it, and gives it to no other', () => {
  test('a proposal removing a link takes the link’s note, and no thing’s', () => {
    const r = applyChange([TRIP], GRAPH, change({ op: 'remove-link', from: 'start', type: 'TO', to: 'mid' }));
    assert.deepEqual(notesOf(r.texts[0]), { things: NOTES.things, links: [] });
    assert.ok(!r.texts[0].includes('Why we go'));
  });

  test('removing the last link takes its own note, and leaves no comma dangling', () => {
    const r = applyChange([LAST], GRAPH, change({ op: 'remove-link', from: 'a', type: 'R', to: 'b' }));
    assert.deepEqual(notesOf(r.texts[0]), { things: { b: 'About b.' }, links: [] });
    assert.equal(r.texts[0], "// graph: trip\n(a:T {name: 'A'}),\n/// About b.\n(b:T {name: 'B'})");
  });

  test('a proposal removing a thing takes its note and tag, the notes of the links it was in, and no other', () => {
    const r = applyChange([TRIP], GRAPH, change({ op: 'remove-thing', thing: 'start' }));
    assert.deepEqual(notesOf(r.texts[0]), { things: { mid: 'Halfway.' }, links: [] });
    assert.ok(!r.texts[0].includes('//@') && !r.texts[0].includes('start'));
  });

  test('a note above a thing that goes is never taken up by the next thing', () => {
    const r = applyChange([TRIP], GRAPH, change({ op: 'remove-thing', thing: 'mid' }));
    assert.deepEqual(notesOf(r.texts[0]), { things: { start: START }, links: [] });
    assert.ok(!r.texts[0].includes('Halfway.') && !r.texts[0].includes('Why we go.'));
  });

  test('taking a value out of a list takes the link’s note and the note of the thing it leaves with', () => {
    const r = removeFromList(LISTED, readNote([LISTED]), GRAPH, 'mid', SHAPE, 'bath');
    assert.equal(r.ok, true, r.reason);
    assert.deepEqual(notesOf(r.text), { things: {}, links: [] });
    assert.ok(!r.text.includes('///'));
  });

  test('taking a step out of a path takes the step’s note, numbers the later steps again, and no other note moves', () => {
    const line = PATHS.split('\n').findIndex((l) => l.includes('seq: 2')) + 1;
    const text = fixed(PATHS, line, '(tour)-[:STEP {seq: 2}]->(mid)');
    assert.deepEqual(notesOf(text), { things: {}, links: ['tour STEP start: First step.'] });
    assert.ok(!text.includes('Second step.') && text.includes('seq: 2}]->(end)'));
  });
});

describe('note_kept_by_edits: undo restores the thing and its note together', () => {
  test('a thing removed from the pane is undone with its note, byte for byte, and redone without it', () => {
    const s = new PaneSession(NOTE, 2);
    const next = applyChange([s.text], GRAPH, change({ op: 'remove-thing', thing: 'mid' })).texts[0];
    s.edit(next);
    const w = s.write(NOTE);
    assert.equal(w.ok, true);
    assert.ok(!w.note.includes('Halfway.'));
    const back = s.undo(w.note);
    assert.equal(back.note, NOTE);
    assert.deepEqual(notesOf(back.note.split('```gql\n')[1].split('\n```')[0]), NOTES);
    assert.equal(s.redo(back.note).note, w.note);
  });

  test('a note added or changed from the pane is undone to the exact block it was', () => {
    const s = new PaneSession(NOTE, 2);
    s.edit(done(setNote(s.text, { thing: 'mid' }, 'Changed.')));
    const w = s.write(NOTE);
    assert.equal(w.ok, true);
    assert.match(w.note, /\/\/\/ Changed\.\n\(mid:/);
    assert.equal(s.undo(w.note).note, NOTE);
  });
});
