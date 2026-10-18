// Finding your way from a thing's details (editor spec §25, slice 3):
// - its links grouped by relationship type and direction, read in words with a count (details_links_listed);
// - the trail of things chosen from them, with back and forward (details_trail);
// - the move to a chosen thing, eased, never too small to read (details_choose_moves, details_move_motion);
// - the arrow at the edge of the view that points to a selection out of sight (selection_pointer);
// - how tall the sheet may be (sheet_min_max).
//
// Host-free: the plugin draws what these say.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { STYLE } from '../src/layout.ts';
import {
  ABOVE_SHEET,
  MOVE_MS,
  READABLE_SCALE,
  SHEET_SHARE,
  Trail,
  coverOf,
  glideAt,
  linkGroups,
  listed,
  pointerTo,
  sheetLimit,
} from '../src/details-nav.ts';

const TEAM = `// graph: team · SOURCE
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(bob)-[:REPORTS_TO]->(ann),
(cy)-[:REPORTS_TO]->(ann),
(ann)-[:REPORTS_TO]->(dee),
(ann)-[:MENTORS]->(bob)`;

describe('a thing’s links, grouped by relationship type and direction, in words', () => {
  const reading = readNote([TEAM]);

  test('each group reads as a sentence with the things at the other end, and a count where there are several', () => {
    assert.deepEqual(
      linkGroups(reading, 'team', 'ann').map((g) => g.words),
      ['reports to Dee', 'mentors Bob', 'is reported to by Bob and Cy (2)'],
    );
  });

  test('every group carries its type, its direction, its count and, for each thing, the link that reaches it', () => {
    const [out, mentors, back] = linkGroups(reading, 'team', 'ann');
    assert.deepEqual(
      { type: out.type, direction: out.direction, count: out.count },
      { type: 'REPORTS_TO', direction: 'out', count: 1 },
    );
    assert.equal(mentors.reading, 'mentors');
    assert.deepEqual(
      { type: back.type, direction: back.direction, count: back.count, reading: back.reading },
      { type: 'REPORTS_TO', direction: 'in', count: 2, reading: 'is reported to by' },
    );
    const links = reading.graphs.get('team').links;
    for (const g of [out, mentors, back])
      for (const t of g.things) {
        const l = links[t.link];
        assert.ok(l.type === g.type, `link ${t.link} is a ${g.type}`);
        assert.equal(g.direction === 'out' ? l.to : l.from, t.key);
        assert.equal(g.direction === 'out' ? l.from : l.to, 'ann');
      }
    assert.deepEqual(
      back.things.map((t) => [t.key, t.text]),
      [
        ['bob', 'Bob'],
        ['cy', 'Cy'],
      ],
    );
  });

  test('the reading back is the schema’s own when it declares one', () => {
    const locked = `${TEAM},
(team_schema:GraphMeta {graph: 'team', schema: 'team@1'}),
(kind_person:Meta:ElementType {name: 'Person', kind: 'node', origin: 'source'}),
(link_reports:Meta:ElementType {name: 'REPORTS_TO', kind: 'edge', origin: 'source', reading: 'reports to', reverse_name: 'manages'}),
(link_mentors:Meta:ElementType {name: 'MENTORS', kind: 'edge', origin: 'source', reading: 'mentors', reverse_name: 'is mentored by'}),
(team_schema)-[:DECLARES]->(kind_person),
(team_schema)-[:DECLARES]->(link_reports),
(team_schema)-[:DECLARES]->(link_mentors)`;
    assert.deepEqual(
      linkGroups(readNote([locked]), 'team', 'bob').map((g) => g.words),
      ['reports to Ann', 'is mentored by Ann'],
    );
    assert.deepEqual(
      linkGroups(readNote([locked]), 'team', 'ann').map((g) => g.words),
      ['reports to Dee', 'mentors Bob', 'manages Bob and Cy (2)'],
    );
  });

  test('a reading with no reverse the words can give is read the other way round, never as “inverse of”', () => {
    const r = readNote(["// graph: g · SOURCE\n(a:X {name: 'A'}),\n(b:X {name: 'B'}),\n(a)-[:PART_OF_PLAN]->(b)"]);
    const [back] = linkGroups(r, 'g', 'b');
    assert.ok(!back.words.includes('inverse of'), back.words);
    assert.equal(back.words, 'A part of plan this');
  });

  test('a thing with no links has no groups; one not drawn has none either', () => {
    const r = readNote(["// graph: g · SOURCE\n(a:X {name: 'A'})"]);
    assert.deepEqual(linkGroups(r, 'g', 'a'), []);
    assert.deepEqual(linkGroups(r, 'g', 'nobody'), []);
    assert.deepEqual(linkGroups(r, 'nowhere', 'a'), []);
  });

  test('the words before and after the names are given apart, so a host can make each name a control', () => {
    const r = readNote(["// graph: g · SOURCE\n(a:X {name: 'A'}),\n(b:X {name: 'B'}),\n(a)-[:PART_OF_PLAN]->(b)"]);
    for (const g of [...linkGroups(reading, 'team', 'ann'), ...linkGroups(r, 'g', 'b')])
      assert.equal(`${g.before}${listed(g.things.map((t) => t.text))}${g.after}`, g.words);
    const [, , back] = linkGroups(reading, 'team', 'ann');
    assert.deepEqual([back.before, back.after], ['is reported to by ', ' (2)']);
  });

  test('two links of one type to the same thing name it once, keeping each link, and count both', () => {
    const r = readNote([
      "// graph: g · SOURCE\n(ann:P {name: 'Ann'}),\n(bob:P {name: 'Bob'}),\n(cy:P {name: 'Cy'}),\n" +
        '(bob)-[:REPORTS_TO]->(ann),\n(cy)-[:REPORTS_TO]->(ann),\n(bob)-[:REPORTS_TO {since: 2025}]->(ann)',
    ]);
    const [back] = linkGroups(r, 'g', 'ann');
    assert.equal(back.words, 'is reported to by Bob and Cy (3)');
    assert.deepEqual(
      back.things.map((t) => [t.key, t.links]),
      [
        ['bob', [0, 2]],
        ['cy', [1]],
      ],
    );
    assert.deepEqual(
      back.things.map((t) => t.link),
      [0, 1],
      'the first link to each',
    );
  });

  test('names are listed as a sentence lists them', () => {
    assert.equal(listed(['Ann']), 'Ann');
    assert.equal(listed(['Bob', 'Cy']), 'Bob and Cy');
    assert.equal(listed(['Bob', 'Cy', 'Dee']), 'Bob, Cy and Dee');
  });
});

describe('the trail of things chosen from the details', () => {
  test('back and forward retrace a walk, and a new choice after going back drops what was ahead', () => {
    const t = new Trail();
    t.start({ key: 'ann' });
    assert.equal(t.canBack(), false);
    t.go({ key: 'bob' });
    t.go({ link: 3 });
    assert.deepEqual(t.current(), { link: 3 });
    assert.deepEqual(t.previous(), { key: 'bob' });
    assert.deepEqual(t.back(), { key: 'bob' });
    assert.deepEqual(t.back(), { key: 'ann' });
    assert.equal(t.back(), null, 'nothing before the start');
    assert.deepEqual(t.next(), { key: 'bob' });
    assert.deepEqual(t.forward(), { key: 'bob' });
    t.go({ key: 'cy' });
    assert.equal(t.canForward(), false, 'the link ahead was dropped');
    assert.deepEqual(t.back(), { key: 'bob' });
    assert.deepEqual(t.forward(), { key: 'cy' });
  });

  test('choosing what is already current adds no step; starting again forgets the old walk; clearing empties it', () => {
    const t = new Trail();
    t.start({ key: 'ann' });
    t.go({ key: 'ann' });
    assert.equal(t.canBack(), false);
    t.go({ key: 'bob' });
    t.start({ key: 'dee' });
    assert.equal(t.canBack(), false);
    assert.deepEqual(t.current(), { key: 'dee' });
    t.clear();
    assert.equal(t.current(), null);
    assert.equal(t.go({ key: 'ann' }), null, 'nothing to walk from once cleared');
  });
});

describe('the move to a chosen thing', () => {
  const from = { scale: 1, x: 0, y: 0 },
    to = { scale: 2, x: -100, y: 50 };

  test('it starts where the view is, ends exactly where it is going, and eases in between', () => {
    assert.deepEqual(glideAt(from, to, 0), from);
    assert.deepEqual(glideAt(from, to, 1), to);
    assert.deepEqual(glideAt(from, to, 1.5), to, 'past the end it stays there');
    const half = glideAt(from, to, 0.5);
    assert.ok(half.scale > 1 && half.scale < 2 && half.x < 0 && half.x > -100);
    const early = glideAt(from, to, 0.1);
    assert.ok(early.x - from.x > -10, 'slow at the start');
  });

  test('it is brief: well under half a second', () => {
    assert.ok(MOVE_MS > 0 && MOVE_MS <= 300);
  });

  test('too small to read means the drawing’s words would be under 11 pixels', () => {
    assert.ok(Math.abs(READABLE_SCALE * STYLE.font_size * (4 / 3) - 11) < 1e-9);
  });
});

describe('the arrow that points to a selection out of sight', () => {
  const viewport = { width: 400, height: 300 };
  const view = (x, y) => ({ scale: 1, x, y, width: 1000, height: 1000 });
  const box = { x: 0.5, y: 0.5, width: 0.05, height: 0.05 };

  test('none while any of it is in view', () => {
    assert.equal(pointerTo(box, view(-400, -400), viewport), null);
    assert.equal(pointerTo(box, view(-520, -400), viewport), null, 'partly in view still counts');
  });

  test('out of sight to the right, it sits at the right edge and points right', () => {
    const p = pointerTo(box, view(0, -400), viewport);
    assert.ok(p.x > 350 && p.x <= 400 - 22, `${p.x}`);
    assert.ok(p.y >= 22 && p.y <= 300 - 22);
    assert.ok(Math.abs(p.angle) < 30, `${p.angle}`);
  });

  test('out of sight below, it points down, and stays above the part the sheet covers', () => {
    const p = pointerTo(box, view(-350, 0), viewport, 100);
    assert.ok(p.angle > 60 && p.angle < 120, `${p.angle}`);
    assert.ok(p.y <= 200 - 22, `above the sheet: ${p.y}`);
  });

  test('hidden under the sheet counts as out of sight', () => {
    // in the viewport, but in its bottom 100 pixels, which the sheet covers
    const p = pointerTo(box, view(-350, -280), viewport, 100);
    assert.ok(p, 'pointed to');
    assert.ok(p.angle > 0, 'downwards');
  });
});

describe('how much the sheet may take of the screen', () => {
  test('never more than its share, and always room above it for the thing and some of the drawing', () => {
    assert.equal(sheetLimit(800), 800 * SHEET_SHARE);
    assert.ok(sheetLimit(800) < 800);
    assert.equal(sheetLimit(250), 250 - ABOVE_SHEET);
    assert.ok(sheetLimit(100) > 0, 'on the smallest screen, still a bar');
  });

  test('how much of a viewport the sheet covers: none above it, all of it below', () => {
    assert.equal(coverOf({ top: 100, bottom: 400 }, 600), 0);
    assert.equal(coverOf({ top: 100, bottom: 400 }, 300), 100);
    assert.equal(coverOf({ top: 100, bottom: 400 }, 50), 300);
  });
});
