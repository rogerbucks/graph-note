// Notes and the editor's edits (editor spec §24, note_kept_by_edits, note_add): every edit the editor makes keeps a
// thing's `///` note with it and takes the note away with the thing, and undo restores both; and `setNote` adds, changes
// and removes a note by writing the comment lines above its thing or link, nothing else in the block changing.
// Every edit the core's index exports is swept: it has a case below, or an exclusion with its reason, and a new one fails
// the last tests until it is added to one or the other.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gqlSpans } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { commaFor, commaInNote, colonFor, colonInNote } from '../src/commas.ts';
import { toStandard } from '../src/strictness.ts';
import { insertBlockAfter } from '../src/store.ts';
import { addView, makeView } from '../src/view-write.ts';
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
    assert.equal(
      text.replace('/// Gone **north**.\n', ''),
      TRIP.replace(/\/\/\/.*\n(\/\/\/\n)?\/\/\/ Packed already\.\n/, ''),
    );
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

  test('the lines written end as the block’s do: with CRLF as the other lines are, and as the note’s own lines when they differ', () => {
    const block = crlf("// graph: trip\n(a:T {name: 'A'}),\n(b:T {name: 'B'})");
    const added = done(setNote(block, { thing: 'b' }, 'One.\n\nTwo.'));
    assert.equal(added, crlf("// graph: trip\n(a:T {name: 'A'}),\n/// One.\n///\n/// Two.\n(b:T {name: 'B'})"));
    // a note whose lines end with LF in a block whose item line ends with CRLF is changed with LF
    const mixed = "// graph: trip\n/// Old.\n(a:T {name: 'A'})\r\n";
    assert.equal(done(setNote(mixed, { thing: 'a' }, 'New.')), "// graph: trip\n/// New.\n(a:T {name: 'A'})\r\n");
  });

  test('a //@ line among the note’s lines keeps its place relative to the note’s first line and to the thing', () => {
    const block = "// graph: trip\n//@ first: 1\n/// Old.\n//@ second: 2\n(a:T {name: 'A'})";
    const text = done(setNote(block, { thing: 'a' }, 'New.\n\nMore.'));
    assert.equal(text, "// graph: trip\n//@ first: 1\n/// New.\n///\n/// More.\n//@ second: 2\n(a:T {name: 'A'})");
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

const reading = readNote([TRIP]);
const SHAPE = { rel: 'HAS', kind: 'Stop' };
const change = (c) => ({ id: 'c1', group: 'g', ...c });
const blockOf = (note) => note.split('```gql\n')[1].split('\n```')[0];
const crlf = (s) => s.replaceAll('\n', '\r\n');
const lf = (s) => s.replaceAll('\r\n', '\n');
const THEN = { ...NOTES, things: { ...NOTES.things, end: 'Journey’s end.' } };
const withoutComma = (after) => TRIP.replace(after, after.replace(/,$/, ''));

/**
 * The edits that change a block without taking a thing or link out, each run on TRIP and read back: [the functions swept
 * (one name, or several), what it does, the run giving the block, and the notes expected after it, NOTES unless it adds one].
 */
const KEPT = [
  ['setProperty', 'sets a property', () => done(setProperty(TRIP, GRAPH, { thing: 'mid' }, 'name', "'Halfway house'"))],
  ['setProperty', 'removes a property', () => done(setProperty(TRIP, GRAPH, { thing: 'mid' }, 'stops', null))],
  ['setProperty', 'sets a link’s property', () => done(setProperty(TRIP, GRAPH, { link: 0 }, 'weight', '2'))],
  ['renameProperty', 'renames a property', () => done(renameProperty(TRIP, GRAPH, { thing: 'mid' }, 'stops', 'halts'))],
  ['setNote', 'adds the note of another thing', () => done(setNote(TRIP, { thing: 'end' }, 'Journey’s end.')), THEN],
  ['addThing', 'adds a thing', () => addThing(reading, GRAPH, TRIP, { text: 'Journey', kind: 'Place' }).text],
  ['makeList', 'makes a list', () => makeList(TRIP, reading, GRAPH, 'mid', 'stops', SHAPE).text],
  ['addToList', 'adds to a list', () => addToList(TRIP, reading, GRAPH, 'mid', SHAPE, 'Wells').text],
  [
    'parkForLater',
    'parks a thing for later, writing its Deferred after the last item',
    () => {
      const text = parkForLater(TRIP, 'end', { what: 'a permit', why: 'the queue' }, reading);
      assert.ok(text.includes('later_end') && text.includes('DEFERS'), 'the Deferred is written');
      return text;
    },
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
    'nudges a thing, in the style graph, and the data block is not touched',
    () => {
      const r = styleEdit(NOTE, GRAPH, { nudge: { word: 'beside', thing: 'start', other: 'end' } });
      assert.ok(r.note, r.refused);
      const spans = gqlSpans(r.note);
      assert.equal(spans.length, 2, 'a style block is written');
      assert.ok(spans[1].text.includes('beside'), 'the nudge is in it');
      assert.equal(spans[0].text, TRIP, 'the data block is byte for byte as it was');
      return spans[0].text;
    },
  ],
  [
    ['lockBlock', 'insertBlockAfter'],
    'locks the graph, writing its schema as a block after the data, which is not touched',
    () => {
      const schema = lockBlock(reading, GRAPH, '2026-10-16');
      const r = insertBlockAfter(NOTE, { line: 2, text: TRIP }, schema);
      assert.equal(r.ok, true, r.reason);
      const spans = gqlSpans(r.note);
      assert.equal(spans.length, 2);
      assert.ok(spans[1].text.includes('ElementType'), 'the schema is written');
      assert.equal(spans[0].text, TRIP, 'the data block is byte for byte as it was');
      return spans[0].text;
    },
  ],
  [
    ['makeView', 'addView'],
    'writes a view block after the graph’s last block, the data not touched',
    () => {
      const view = makeView(GRAPH, 'all_kinds', { kind: 'kinds', kinds: ['Place'] });
      assert.ok(view.block, view.refused);
      const r = addView(NOTE, GRAPH, view.block);
      assert.ok(r.note, r.refused);
      const spans = gqlSpans(r.note);
      assert.equal(spans.length, 2);
      assert.equal(spans[0].text, TRIP);
      return spans[0].text;
    },
  ],
  [
    'toStandard',
    'writes the comma a note lacked, converting the note to standard GQL',
    () => {
      const r = toStandard(fence(withoutComma("(start:Place {name: 'Start'}),")));
      assert.equal(r.ok, true, r.reason);
      assert.equal(r.changed, 1);
      assert.equal(blockOf(r.note), TRIP, 'the block is as written, with its comma');
      return blockOf(r.note);
    },
  ],
  [
    ['commaFor', 'commaInNote'],
    'adds the comma before a ( typed under a note',
    () => {
      const text = withoutComma("(end:Place {name: 'End'}),"),
        caret = text.indexOf('(start)') + 1;
      const at = commaFor(text.slice(0, caret), caret);
      assert.notEqual(at, null);
      assert.equal(commaInNote(fence(text), caret + '```gql\n'.length), at + '```gql\n'.length);
      return text.slice(0, at) + ',' + text.slice(at);
    },
  ],
  [
    ['colonFor', 'colonInNote'],
    'writes the colon of a link type written without it, beside its note',
    () => {
      const text = TRIP.replace('(start)-[:TO]', '(start)-[TO]'),
        caret = text.indexOf('[TO]') + 4,
        earlier = '// graph: trip\n(x)-[:TO]->(y)';
      const change = colonFor(text.slice(0, caret), caret, [earlier]);
      assert.deepEqual(change && change.text, ':TO');
      const inNote = fence(earlier) + '\n\n' + fence(text),
        shift = inNote.indexOf(text);
      assert.deepEqual(colonInNote(inNote, shift + caret), {
        ...change,
        from: change.from + shift,
        to: change.to + shift,
      });
      return applyChanges(text, [change]);
    },
  ],
  [
    ['renamedLinks', 'applyChanges'],
    'follows a renamed note in a property',
    () => {
      const note = fence(TRIP.replace("name: 'Start'", "name: 'Start', see: '[[Old trip]]'")),
        changes = renamedLinks(note, 'Old trip.md', 'New trip.md');
      assert.equal(changes.length, 1);
      return blockOf(applyChanges(note, changes));
    },
  ],
];
const names = (entry) => [entry].flat();

describe('note_kept_by_edits: an edit that takes nothing out leaves every note on the thing it was on', () => {
  for (const [entry, what, run, expected = NOTES] of KEPT)
    test(`${names(entry).join(' and ')} ${what}`, () => {
      const text = run();
      assert.equal(typeof text, 'string');
      assert.deepEqual(notesOf(text), expected);
      for (const line of TRIP.split('\n').filter((l) => l.startsWith('/// ') || l.startsWith('//@')))
        assert.ok(text.includes(line), `kept ${line}`);
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
const BLANK = `// graph: trip
(a:T {name: 'A'}),

/// About b.
(b:T {name: 'B'}),
(c:T {name: 'C'})`;
const STRAY = `// graph: trip
(a:T {name: 'A'}),
/// Stray.

(b:T {name: 'B'}),
(c:T {name: 'C'})`;

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
const stepLine = (block) => block.split('\n').findIndex((l) => l.includes('seq: 2')) + 1;
const gone = (block, op) => (w) => applyChange([w(block)], GRAPH, change(op)).texts[0];

/**
 * The edits that take a thing or link out, each run as written and again with CRLF line ends: [the functions swept, what
 * it does, the run given how to wrap the block's text, the notes expected after it, and what else holds].
 */
const REMOVING = [
  [
    'applyChange',
    'a proposal removing a link takes the link’s note, and no thing’s',
    gone(TRIP, { op: 'remove-link', from: 'start', type: 'TO', to: 'mid' }),
    { things: NOTES.things, links: [] },
    (t) => assert.ok(!t.includes('Why we go')),
  ],
  [
    'applyChange',
    'removing the last link takes its own note, and leaves no comma dangling',
    gone(LAST, { op: 'remove-link', from: 'a', type: 'R', to: 'b' }),
    { things: { b: 'About b.' }, links: [] },
    (t) => assert.equal(t, "// graph: trip\n(a:T {name: 'A'}),\n/// About b.\n(b:T {name: 'B'})"),
  ],
  [
    'applyChange',
    'removing the first item, at the start of the block, takes its note and tag, the notes of its links, and no other',
    gone(TRIP, { op: 'remove-thing', thing: 'start' }),
    { things: { mid: 'Halfway.' }, links: [] },
    (t) => assert.ok(!t.includes('//@') && !t.includes('start')),
  ],
  [
    'applyChange',
    'a note above a thing that goes is never taken up by the next thing',
    gone(TRIP, { op: 'remove-thing', thing: 'mid' }),
    { things: { start: START }, links: [] },
    (t) => assert.ok(!t.includes('Halfway.') && !t.includes('Why we go.')),
  ],
  [
    'applyChange',
    'removing the last item takes its note, whatever the item before it is',
    gone(LAST, { op: 'remove-thing', thing: 'b' }),
    { things: {}, links: [] },
    (t) => assert.ok(!t.includes('///')),
  ],
  [
    'applyChange',
    'a blank line between the note and the item above it does not stop the note going with its thing',
    gone(BLANK, { op: 'remove-thing', thing: 'b' }),
    { things: {}, links: [] },
    (t) => assert.ok(!t.includes('About b.') && t.includes("(c:T {name: 'C'})")),
  ],
  [
    'applyChange',
    'a note a blank line cuts off from its thing belongs to none, so it stays, and the next thing does not take it up',
    gone(STRAY, { op: 'remove-thing', thing: 'b' }),
    { things: {}, links: [] },
    (t) => assert.ok(t.includes('/// Stray.')),
  ],
  [
    'removeFromList',
    'taking a value out of a list takes the link’s note and the note of the thing it leaves with',
    (w) => {
      const r = removeFromList(w(LISTED), readNote([w(LISTED)]), GRAPH, 'mid', SHAPE, 'bath');
      assert.equal(r.ok, true, r.reason);
      return r.text;
    },
    { things: {}, links: [] },
    (t) => assert.ok(!t.includes('///')),
  ],
  [
    'removal',
    'taking a step out of a path takes the step’s note, numbers the later steps again, and no other note moves',
    (w) => fixed(w(PATHS), stepLine(PATHS), '(tour)-[:STEP {seq: 2}]->(mid)'),
    { things: {}, links: ['tour STEP start: First step.'] },
    (t) => assert.ok(!t.includes('Second step.') && t.includes('seq: 2}]->(end)')),
  ],
];

describe('note_kept_by_edits: an edit that takes a thing or link out takes its note with it, and gives it to no other', () => {
  for (const [entry, what, run, expected, holds] of REMOVING) {
    test(`${names(entry).join(' and ')}: ${what}`, () => {
      const text = run((s) => s);
      assert.deepEqual(notesOf(text), expected);
      holds(text);
    });
    test(`${names(entry).join(' and ')}: ${what}, in a block with CRLF line ends`, () => {
      const text = lf(run(crlf));
      assert.equal(text, lf(run((s) => s)), 'the same block as with LF line ends');
      assert.deepEqual(notesOf(text), expected);
      holds(text);
    });
  }
});

/** The functions of the core's index that write text, which the sweep above and below either covers or excludes. */
const EDIT_MODULES = [
  'store',
  'estimate-fix',
  'style-edit',
  'lock',
  'paths',
  'view-write',
  'strictness',
  'deferred',
  'suggested-names',
  'add-thing',
  'commas',
  'inspector',
  'note-edit',
  'linked-list',
  'links',
];
/** Of `links`, the functions that write text (the rest read links). */
const LINK_EDITS = ['applyChanges', 'renamedLinks', 'withMeant'];
const EXCLUDED = {
  replaceBlock:
    'writes the block text it is given, whole; every edit above reaches the note through it in the pane tests',
  History: 'keeps whole block texts for undo, which the pane tests restore byte for byte',
  estimateFix: 'returns the fix for one misspelt word in a path, applied by the host; it reaches no comment line',
  isDraft: 'reads only',
  reverseGuess: 'turns a reading into words, no text of a block',
  PathPlayer: 'plays a walk, writes nothing',
  PathRecorder: 'records the boxes tapped, writes nothing',
  mergePathProblems: 'reads only',
  pathProblems: 'reads only',
  pathsOf: 'reads only',
  DEPARTURES: 'a list of words',
  underStrictness: 'reads only',
  standardBlocks: 'converts blocks for an engine or export, never written to the note',
  DeferredNotDeclared: 'an error class, writes nothing',
  declareDeferred: 'writes only the declarations into the graph’s schema block, which holds no thing’s note',
  declareDeferredBlock: 'writes only the declarations into the graph’s schema block, which holds no thing’s note',
  parked: 'reads only',
  parkedCount: 'reads only',
  acceptNameFirst: 'says why an edit must wait, writes nothing',
  suggestName: 'gives a name, writes nothing',
  parseValue: 'reads a value',
  propertiesOf: 'reads only',
  propertyNames: 'reads only',
  spanOf: 'reads only',
  linkInBlock: 'reads only',
  listValues: 'reads only',
  linkedValues: 'reads only',
  listsOf: 'reads only',
  withMeant: 'replaces one word inside a link’s line in a property, as renamedLinks does',
};

/** The functions the index exports from the modules that edit, found in the entry itself. */
function editExports() {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const out = [];
  for (const [, list, module] of src.matchAll(/^export \{([^}]*)\} from '\.\/([\w-]+)\.ts';/gm))
    if (EDIT_MODULES.includes(module))
      for (const raw of list.split(',')) {
        const name = raw.trim();
        if (name && !name.startsWith('type ') && (module !== 'links' || LINK_EDITS.includes(name))) out.push(name);
      }
  return out.sort();
}

describe('note_kept_by_edits: every edit the core exports is swept above, or excluded here with its reason', () => {
  const swept = new Set([...KEPT, ...REMOVING].flatMap(([entry]) => names(entry)));

  test('each export of an editing module is swept or excluded, never both and never neither', () => {
    const exported = editExports();
    assert.ok(exported.length > 40, 'the editing modules were found in the index');
    for (const name of exported) assert.ok(swept.has(name) !== name in EXCLUDED, `${name}: swept or excluded`);
  });

  test('each exclusion names an export and gives a reason, and no function is swept that the index does not export unless it is internal', () => {
    const exported = editExports();
    for (const [name, reason] of Object.entries(EXCLUDED)) {
      assert.ok(exported.includes(name), `${name} is exported by an editing module`);
      assert.ok(reason.length > 8, `${name} has a reason`);
    }
    const internal = ['applyChange', 'removal'];
    for (const name of swept) assert.ok(exported.includes(name) || internal.includes(name), `${name} is exported`);
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
