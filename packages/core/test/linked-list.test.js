// A property held as a list of linked things (editor spec §14, list_as_linked_things): choosing List turns a property's
// values into things linked to this one — of a kind and by a relationship the user names, reusing a thing that already has
// that name — and a value is added or removed as an edit of the block's text that reads back as intended (§2).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { TextHistory } from '../src/history.ts';
import { listValues, makeList, addToList, removeFromList, linkedValues, listsOf } from '../src/linked-list.ts';

const SHOP = `// graph: shop
(cafe:Place {name: 'Corner Cafe', tags: 'quiet, cheap'}),
(sam:Person {name: 'Sam'}),
(sam)-[:RUNS]->(cafe)`;
const TAG = { rel: 'HAS_TAG', kind: 'Tag' };
const reading = (...blocks) => readNote(blocks);
// what the badge counts: a hint (such as text suggested for a thing) is offered, never counted as a problem
const problems = (r) => r.problems.filter((p) => p.severity !== 'hint');
const graphOf = (...blocks) => reading(...blocks).world.shop;
/** The ids a thing is linked to by a relationship, in the order written. */
const linked = (text, id, rel = 'HAS_TAG') =>
  graphOf(text)
    .out(id, rel)
    .map((e) => e[2]);
const made = (block = SHOP, key = 'tags', shape = TAG, thing = 'cafe') =>
  makeList(block, reading(block), 'shop', thing, key, shape);
const ok = (r) => {
  assert.ok(r.ok, r.reason);
  return r.text;
};

describe('the values a property holds', () => {
  test('words are split at commas, semicolons and new lines, trimmed, with no empty value and none twice', () => {
    assert.deepEqual(listValues('quiet, cheap;  Fast Wi-Fi\nquiet , ,Cheap'), ['quiet', 'cheap', 'Fast Wi-Fi']);
    assert.deepEqual(listValues('300'), ['300']);
    assert.deepEqual(listValues('  '), []);
  });
});

describe('choosing List for a property', () => {
  test('its values become things of the kind, each linked from this thing by the relationship, and the property goes', () => {
    const text = ok(made());
    const g = graphOf(text);
    assert.deepEqual(linked(text, 'cafe'), ['quiet', 'cheap']);
    assert.ok(g.has('quiet', 'Tag') && g.has('cheap', 'Tag'));
    assert.equal(g.p('cafe').tags, undefined);
    assert.equal(g.p('cafe').name, 'Corner Cafe', 'the rest of the thing is as it was');
    assert.equal(
      text,
      SHOP.replace(", tags: 'quiet, cheap'", '') +
        ',\n(quiet:Tag),\n(cafe)-[:HAS_TAG]->(quiet),\n(cheap:Tag),\n(cafe)-[:HAS_TAG]->(cheap)',
    );
  });

  test('a thing is named from its value as a simple slug, and keeps the words it was given as its name', () => {
    const block = SHOP.replace('quiet, cheap', "Fast Wi-Fi, it\\'s 24/7");
    const r = made(block);
    const text = ok(r);
    assert.deepEqual(linked(text, 'cafe'), ['Fast_Wi_Fi', 'it_s_24_7']);
    assert.match(text, /\(Fast_Wi_Fi:Tag \{name: 'Fast Wi-Fi'\}\)/);
    assert.match(text, /\(it_s_24_7:Tag \{name: 'it\\'s 24\/7'\}\)/);
    const drawn = reading(text)
      .graphs.get('shop')
      .boxes.find((b) => b.key === 'Fast_Wi_Fi');
    assert.equal(drawn.text, 'Fast Wi-Fi');
    assert.deepEqual(r.things, [
      { thing: 'Fast_Wi_Fi', text: 'Fast Wi-Fi' },
      { thing: 'it_s_24_7', text: "it's 24/7" },
    ]);
  });

  test('a thing of the kind that already has that name is reused, not written a second time', () => {
    const block = SHOP.replace('(sam:Person', "(q1:Tag {name: 'Quiet'}),\n(sam:Person");
    const text = ok(made(block));
    assert.deepEqual(linked(text, 'cafe'), ['q1', 'cheap']);
    assert.equal(graphOf(text).labelled('Tag').length, 2, 'q1 and the new cheap only');
    assert.doesNotMatch(text, /\(quiet:Tag/);
  });

  test('a thing whose id is the name is reused too, and a name is matched whatever its case', () => {
    const block = SHOP.replace('(sam:Person', '(Cheap:Tag),\n(sam:Person');
    const text = ok(made(block));
    assert.deepEqual(linked(text, 'cafe'), ['quiet', 'Cheap']);
    assert.equal(graphOf(text).labelled('Tag').length, 2);
  });

  test('a name taken by a thing of another kind is not reused: the new thing takes an id that is unique in the graph', () => {
    const block = SHOP.replace('(sam:Person', '(cheap:Place),\n(sam:Person');
    const text = ok(made(block));
    assert.deepEqual(linked(text, 'cafe'), ['quiet', 'cheap_2']);
    assert.ok(graphOf(text).has('cheap', 'Place'), 'the place is untouched');
    assert.match(text, /\(cheap_2:Tag \{name: 'cheap'\}\)/);
  });

  test('a thing made for one list is reused by the next thing’s list', () => {
    const one = ok(made());
    const second = one.replace(
      '(sam)-[:RUNS]->(cafe)',
      "(sam)-[:RUNS]->(cafe),\n(bar:Place {name: 'Bar', tags: 'cheap'})",
    );
    const text = ok(makeList(second, reading(second), 'shop', 'bar', 'tags', TAG));
    assert.deepEqual(linked(text, 'bar'), ['cheap']);
    assert.equal(graphOf(text).labelled('Tag').length, 2, 'cheap is one thing, linked from both');
  });

  test('new items go before a SET, after the last path, and a comment on its own line stays where it was', () => {
    const block = `${SHOP}\n// the cafe\nSET sam.title = 'owner'`;
    const text = ok(made(block));
    assert.ok(text.indexOf('(quiet:Tag)') < text.indexOf('SET sam.title'));
    assert.match(text, /\(sam\)-\[:RUNS\]->\(cafe\),\n\(quiet:Tag\),[\s\S]*->\(cheap\)\n\/\/ the cafe\nSET /);
    assert.deepEqual(linked(text, 'cafe'), ['quiet', 'cheap']);
    assert.equal(graphOf(text).p('sam').title, 'owner');
    assert.equal(problems(reading(text)).length, 0);
  });

  test('a property with no words becomes an empty list; no key at all only declares one, and changes no text', () => {
    const block = SHOP.replace("tags: 'quiet, cheap'", "tags: ''");
    assert.equal(ok(made(block)), block.replace(", tags: ''", ''));
    assert.equal(ok(made(SHOP, null)), SHOP);
  });

  test('a property set elsewhere, a kind or relationship that is not one word, or a thing not written here is refused', () => {
    const set = `${SHOP}\nSET cafe.mood = 'calm'`;
    assert.match(made(set, 'mood').reason, /mood is not written in its pattern here/);
    assert.match(made(SHOP, 'tags', { rel: 'HAS TAG', kind: 'Tag' }).reason, /relationship.*one word/);
    assert.match(made(SHOP, 'tags', { rel: 'HAS_TAG', kind: '' }).reason, /kind.*one word/);
    assert.match(made(SHOP, 'tags', TAG, 'ghost').reason, /ghost is not written in this block/);
    assert.match(made(SHOP, 'nothing').reason, /nothing is not written in its pattern here/);
  });

  test('the edit is a change to the text alone, so the editor’s own undo restores the original bytes', () => {
    const copy = `${SHOP}`;
    const text = ok(made());
    assert.equal(SHOP, copy);
    const history = new TextHistory({ text: SHOP, start: 0, end: 0 });
    history.record({ text, start: 0, end: 0 }, 'other');
    assert.equal(history.undo()?.text, SHOP);
  });
});

const LISTED_BLOCK = ok(made());

describe('a value added to a list, or removed', () => {
  const LISTED = LISTED_BLOCK;
  const add = (block, value, shape = TAG) => addToList(block, reading(block), 'shop', 'cafe', shape, value);
  const drop = (block, value, r = reading(block)) => removeFromList(block, r, 'shop', 'cafe', TAG, value);

  test('a value added is a thing of the kind, linked, written at the end of the block', () => {
    const r = add(LISTED, 'Open late');
    const text = ok(r);
    assert.equal(text, `${LISTED},\n(Open_late:Tag {name: 'Open late'}),\n(cafe)-[:HAS_TAG]->(Open_late)`);
    assert.deepEqual(linked(text, 'cafe'), ['quiet', 'cheap', 'Open_late']);
    assert.deepEqual(r.things, [{ thing: 'Open_late', text: 'Open late' }]);
  });

  test('a value that names a thing already there is linked to it, not written again; one already in the list is refused', () => {
    const block = LISTED.replace('(sam:Person', "(late:Tag {name: 'Open late'}),\n(sam:Person");
    const text = ok(add(block, 'open late'));
    assert.match(text, /\(cafe\)-\[:HAS_TAG\]->\(late\)$/);
    assert.equal(graphOf(text).labelled('Tag').length, 3);
    assert.match(add(LISTED, 'Quiet').reason, /already in the list/);
    assert.match(add(LISTED, '   ').reason, /empty/);
  });

  test('two additions made before the note is read again do not write a thing twice', () => {
    const stale = reading(LISTED);
    const once = ok(addToList(LISTED, stale, 'shop', 'cafe', TAG, 'Open late'));
    assert.match(addToList(once, stale, 'shop', 'cafe', TAG, 'open late').reason, /already in the list/);
    const other = ok(addToList(once, stale, 'shop', 'cafe', TAG, 'open-late'));
    assert.match(other, /\(open_late:Tag/, 'a different value, a different thing');
    assert.equal(graphOf(other).labelled('Tag').length, 4);
  });

  test('removing a value removes its link, and the thing too when nothing else links to it', () => {
    const r = drop(LISTED, 'quiet');
    const text = ok(r);
    assert.deepEqual(linked(text, 'cafe'), ['cheap']);
    assert.equal(graphOf(text).nodes.has('quiet'), false);
    assert.match(r.said, /removed the link and quiet, which nothing else linked to/);
    assert.equal(text, LISTED.replace('(quiet:Tag),\n(cafe)-[:HAS_TAG]->(quiet),\n', ''));
  });

  test('the last value in the block, and the whole list in turn, can be removed and the block still reads', () => {
    const text = ok(drop(ok(drop(LISTED, 'cheap')), 'quiet'));
    assert.equal(text, SHOP.replace(", tags: 'quiet, cheap'", ''));
    assert.equal(problems(reading(text)).length, 0);
  });

  test('a thing something else links to stays, and the message says it was kept', () => {
    const other = "// graph: shop\n(bar:Place {name: 'Bar'}),\n(bar)-[:HAS_TAG]->(quiet)";
    const r = drop(LISTED, 'quiet', reading(LISTED, other));
    const text = ok(r);
    assert.deepEqual(linked(text, 'cafe'), ['cheap']);
    assert.match(r.said, /removed the link; quiet stays, as something else links to it/);
    assert.match(text, /\(quiet:Tag\)/);
  });

  test('a link written inside a longer path is left to the text, and a value not in the list is refused', () => {
    const chained = LISTED.replace('(cafe)-[:HAS_TAG]->(quiet)', '(sam)-[:RUNS]->(cafe)-[:HAS_TAG]->(quiet)');
    assert.match(drop(chained, 'quiet').reason, /written together with other things/);
    assert.match(drop(LISTED, 'ghost').reason, /not in the list/);
  });
});

describe('the lists a thing holds, as the inspector shows them', () => {
  test('the things reached by the relationship, of the kind, are the list’s values', () => {
    const text = ok(made());
    assert.deepEqual(linkedValues(reading(text), 'shop', 'cafe', TAG), [
      { thing: 'quiet', text: 'quiet' },
      { thing: 'cheap', text: 'cheap' },
    ]);
    assert.deepEqual(linkedValues(reading(text), 'shop', 'cafe', { rel: 'HAS_TAG', kind: 'Place' }), []);
  });

  test('a list is found where the links go to bare things of one kind; not to things with links or properties of their own', () => {
    assert.deepEqual(listsOf(reading(ok(made())), 'shop', 'cafe'), [TAG]);
    assert.deepEqual(listsOf(reading(SHOP), 'shop', 'sam'), [], 'sam runs a cafe that has a name and links');
    const titled = SHOP.replace('(sam:Person', "(q:Tag {title: 'Which?'}),\n(sam:Person") + ',\n(cafe)-[:HAS_TAG]->(q)';
    assert.deepEqual(listsOf(reading(titled), 'shop', 'cafe'), []);
  });
});

describe('review fixes: values are never merged, comments never lost, and the edit follows the block', () => {
  const props = (text, id) => graphOf(text).p(id);

  test('values that slug alike are different things: names with no ASCII letters take an id from the kind', () => {
    const text = ok(made(SHOP.replace('quiet, cheap', '東京, 大阪')));
    assert.deepEqual(linked(text, 'cafe'), ['tag', 'tag_2']);
    assert.equal(props(text, 'tag').name, '東京');
    assert.equal(props(text, 'tag_2').name, '大阪');
  });

  test('A-B and A B are two things, each keeping its words as its name', () => {
    const text = ok(made(SHOP.replace('quiet, cheap', 'A-B, A B')));
    assert.deepEqual(linked(text, 'cafe'), ['A_B', 'A_B_2']);
    assert.deepEqual([props(text, 'A_B').name, props(text, 'A_B_2').name], ['A-B', 'A B']);
  });

  test('a value is never reused through its slug: Open-late is not Open_late, whatever the case', () => {
    const block = LISTED_BLOCK.replace('(sam:Person', '(Open_late:Tag),\n(sam:Person');
    const first = ok(addToList(block, reading(block), 'shop', 'cafe', TAG, 'Open-late'));
    assert.match(first, /\(Open_late_2:Tag \{name: 'Open-late'\}\)/);
    const second = ok(addToList(block, reading(block), 'shop', 'cafe', TAG, 'open-late'));
    assert.match(second, /\(open_late:Tag \{name: 'open-late'\}\)/);
  });

  test('accents are stripped from an id and kept in the name: café is cafe, Müller is Muller', () => {
    const text = ok(made(SHOP.replace('quiet, cheap', 'café, Müller')));
    assert.deepEqual(linked(text, 'cafe'), ['cafe_2', 'Muller']);
    assert.equal(props(text, 'cafe_2').name, 'café');
    assert.equal(props(text, 'Muller').name, 'Müller');
  });

  test('removing the last value takes its item and its comma, never a comment', () => {
    const block = `// graph: shop\n(cafe:Place {name: 'C'}),\n(x:Tag),\n// the tag link\n(cafe)-[:HAS_TAG]->(x)`;
    const r = removeFromList(block, reading(block), 'shop', 'cafe', TAG, 'x');
    assert.equal(ok(r), `// graph: shop\n(cafe:Place {name: 'C'})\n// the tag link`);
    assert.equal(problems(reading(r.text)).length, 0);
  });

  test('a comment above a removed item in the middle of the block stays too', () => {
    const block = `// graph: shop\n(cafe:Place {name: 'C'}),\n// about x\n(x:Tag),\n(cafe)-[:HAS_TAG]->(x),\n(sam:Person)`;
    const text = ok(removeFromList(block, reading(block), 'shop', 'cafe', TAG, 'x'));
    assert.equal(text, `// graph: shop\n(cafe:Place {name: 'C'}),\n// about x\n(sam:Person)`);
    assert.equal(problems(reading(text)).length, 0);
  });

  test('a thing with properties of its own stays when its value is removed, and the message says why', () => {
    const block = LISTED_BLOCK.replace('(quiet:Tag)', "(quiet:Tag {name: 'quiet', note: 'keep'})");
    const r = removeFromList(block, reading(block), 'shop', 'cafe', TAG, 'quiet');
    const text = ok(r);
    assert.match(text, /\(quiet:Tag \{name: 'quiet', note: 'keep'\}\)/);
    assert.doesNotMatch(text, /\(cafe\)-\[:HAS_TAG\]->\(quiet\)/);
    assert.match(r.said, /quiet stays, as it has properties of its own/);
  });

  test('the values come from the block as it is now, not from an older reading', () => {
    const old = reading(SHOP.replace('quiet, cheap', 'a'));
    const text = ok(makeList(SHOP.replace('quiet, cheap', 'a, b, c'), old, 'shop', 'cafe', 'tags', TAG));
    assert.deepEqual(linked(text, 'cafe'), ['a', 'b', 'c']);
  });

  test('a block that is an INSERT gets its new items after a comma', () => {
    const block = "// graph: shop\nINSERT (cafe:Place {name: 'C', tags: 'x, y'})";
    const text = ok(makeList(block, reading(block), 'shop', 'cafe', 'tags', TAG));
    assert.match(text, /^INSERT \(cafe:Place \{name: 'C'\}\),\n\(x:Tag\)/m);
    assert.deepEqual(linked(text, 'cafe'), ['x', 'y']);
    assert.equal(problems(reading(text)).length, 0);
  });

  test('a thing cannot be a value of its own list', () => {
    const r = made(SHOP.replace('quiet, cheap', 'cafe'), 'tags', { rel: 'SEES', kind: 'Place' });
    assert.match(r.reason, /cafe is this thing itself/);
    assert.match(
      addToList(SHOP, reading(SHOP), 'shop', 'cafe', { rel: 'SEES', kind: 'Place' }, 'cafe').reason,
      /itself/,
    );
  });

  test('after a reload, a list is a relationship and kind with at least two bare targets, or one named HAS_ and the kind', () => {
    const owned = "// graph: shop\n(cafe:Place {name: 'C'}),\n(sam:Person {name: 'Sam'}),\n(cafe)-[:OWNED_BY]->(sam)";
    assert.deepEqual(listsOf(reading(owned), 'shop', 'cafe'), [], 'one owner is a link, not a list');
    const two = owned + ",\n(ann:Person {name: 'Ann'}),\n(cafe)-[:OWNED_BY]->(ann)";
    assert.deepEqual(listsOf(reading(two), 'shop', 'cafe'), [{ rel: 'OWNED_BY', kind: 'Person' }]);
    const has = owned.replace('OWNED_BY', 'HAS_PERSON');
    assert.deepEqual(listsOf(reading(has), 'shop', 'cafe'), [{ rel: 'HAS_PERSON', kind: 'Person' }]);
  });
});
