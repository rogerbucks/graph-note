// Every view returns the same things in the core as in Grafeo (editor spec §2 views_in_the_note; §7 view_is_query,
// five_view_kinds, view_profile, views_agree_with_grafeo). One table, python/graph_spec/tests/view_cases.json, holds
// small notes with views of each of the five kinds. The views are written in them as named query blocks, with what each
// view returns. The table also holds queries outside the view profile with the refusal each gets. This test holds the
// core to the table; the Python library's tests/test_view_parity.py holds Grafeo, running the same queries, to it.
// Together they prove the two return the same.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readNote } from '../src/drawing.ts';
import { evaluate } from '../src/view-evaluate.ts';
import { parseView, VIEW_FORMS, VIEW_KINDS, VIEW_LIMITS, viewName } from '../src/view-profile.ts';
import { viewsOf } from '../src/views.ts';

const TABLE = JSON.parse(
  readFileSync(new URL('../../../python/graph_spec/tests/view_cases.json', import.meta.url), 'utf8'),
);
const text = (lines) => lines.join('\n');

// each note as the core opens it: its data blocks, then its views, every one a block of the note
const NOTES = TABLE.notes.map((note) => {
  const texts = [...note.blocks.map(text), ...note.views.map((v) => text(v.block))];
  return { note, reading: readNote(texts), found: viewsOf(texts) };
});
const VIEWS = NOTES.flatMap(({ note, reading, found }) =>
  note.views.map((view, i) => ({ note, view, reading, found: found[i] })),
);
const sorted = (xs) => [...xs].sort();

describe('views are written in the note', () => {
  // proves: views_in_the_note, view_is_query
  test('each view is a query block of the note whose graph line names it a view, found in the order written', () => {
    for (const { note, reading, found } of NOTES) {
      assert.deepEqual(
        found,
        note.views.map((v, i) => ({
          name: /QUERY view (\w+)$/.exec(v.block[0])?.[1],
          graph: note.graph,
          block: note.blocks.length + i,
          query: text(v.block.slice(1)),
        })),
        note.name,
      );
      // no view is drawn as data: the graph's things are its data blocks' alone, whatever the views ask for
      assert.deepEqual([...reading.graphs.keys()], [note.graph], note.name);
    }
  });

  // proves: views_agree_with_grafeo
  test('a block the reader cannot read is left out, as it is before Grafeo is given the note', () => {
    for (const { note, reading } of NOTES) {
      const errors = new Set(reading.problems.filter((p) => p.severity === 'error').map((p) => p.block));
      assert.deepEqual([...errors], note.left_out ?? [], note.name);
    }
  });
});

describe('the five kinds of view', () => {
  // proves: five_view_kinds, view_profile
  test('each view query is read as the view the table gives', () => {
    for (const { view, found } of VIEWS) assert.deepEqual(parseView(found.query), view.spec, found.name);
  });

  // proves: views_agree_with_grafeo, five_view_kinds
  test('each view returns the things the table gives, which Grafeo returns for the same query', () => {
    for (const { note, view, reading, found } of VIEWS) {
      const r = evaluate(view.spec, reading, note.graph),
        drawn = reading.graphs.get(note.graph).links;
      assert.deepEqual(sorted(r.things), view.things, `${found.name}: things`);
      assert.deepEqual(
        r.links.map((i) => `${drawn[i].from} ${drawn[i].type} ${drawn[i].to}`),
        view.links,
        `${found.name}: links`,
      );
      assert.equal(r.empty, view.things.length === 0, `${found.name}: empty`);
      assert.deepEqual(r.missing, view.missing, `${found.name}: missing`);
      assert.deepEqual(r.walk, view.walk, `${found.name}: walk`);
    }
  });

  // proves: five_view_kinds
  test('the table has every kind returning things and returning nothing, and each at the limit of its steps', () => {
    const seen = new Map(VIEW_KINDS.map((k) => [k, new Set()]));
    for (const { view } of VIEWS) seen.get(view.spec.kind).add(view.things.length > 0);
    for (const [kind, outcomes] of seen) assert.deepEqual(outcomes, new Set([true, false]), kind);
    const at = (kind, steps) => VIEWS.filter(({ view: { spec } }) => spec.kind === kind && steps(spec));
    assert.ok(at('near', (s) => s.depth === VIEW_LIMITS.near).some(({ view }) => view.things.length));
    const six = at('reaches', (s) => s.steps === VIEW_LIMITS.steps).map(({ view }) => view.things.length > 0);
    assert.deepEqual(new Set(six), new Set([true, false]), 'reaching in 6 steps, and needing a 7th');
    // a walked path with a step through something removed still walks the rest
    const partWalked = VIEWS.filter(({ note, view }) => note.left_out?.length && view.walk?.length);
    assert.ok(partWalked.length, 'a path walked in part');
  });
});

describe('a query outside the view profile', () => {
  // proves: view_profile
  test('is refused with the reason the table gives, saying the five shapes allowed and showing the nearest', () => {
    for (const { query, nearest, reason } of TABLE.refused)
      assert.deepEqual(
        parseView(query),
        { refused: `${reason}. ${TABLE.allowed}. The nearest is ${viewName(nearest)}: ${VIEW_FORMS[nearest]}` },
        JSON.stringify(query),
      );
    assert.deepEqual(new Set(TABLE.refused.map((r) => r.nearest)), new Set(VIEW_KINDS), 'a refusal nearest each kind');
  });
});
