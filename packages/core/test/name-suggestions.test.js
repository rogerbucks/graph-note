// Names suggested for things (editor spec §4: name_from_text, text_from_name, suggested_name_unique): a name follows the
// pattern of the names already in the graph, a text follows from a name, and a suggested name is never one already taken.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nameFromText, nameSlug, nameStyleOf, nameWords, textFromName } from '../src/name-suggestions.ts';

describe('a name from a text', () => {
  test('in a graph with no names yet, it is snake_case from the first three words, lowercased, with punctuation dropped', () => {
    assert.equal(nameFromText('Large e-ink reader, with a case', []), 'large_eink_reader');
    assert.equal(nameFromText("Don't panic!", []), 'dont_panic');
  });

  test('a style given is followed in place of the one the names show, while the names still keep a new name unique', () => {
    const names = ['small_reader', 'large_reader'];
    assert.equal(nameFromText('Costs much less', names), 'costs_much');
    assert.equal(
      nameFromText('Costs much less', names, undefined, { casing: 'snake', words: 3, prefix: 'none' }),
      'costs_much_less',
    );
    assert.equal(
      nameFromText('Costs much less', [...names, 'costs_much_less'], undefined, nameStyleOf(['reader'])),
      'costs_much_less_2',
    );
  });

  test('small words are left out, unless the text is nothing else', () => {
    assert.equal(nameFromText('The size of the screen', []), 'size_screen');
    assert.equal(nameFromText('To be or to be', []), 'to_be_or');
  });

  test('it follows how many words the names in the graph have', () => {
    assert.equal(nameFromText('Costs much less', ['small_reader', 'large_reader']), 'costs_much');
    assert.equal(nameFromText('Costs much less', ['reader']), 'costs_much_less');
    assert.equal(nameFromText('Costs much less today', ['easy_on_the_eyes', 'costs_less_today']), 'costs_much_less');
  });

  test('it follows camelCase, and PascalCase, where the names in the graph are written so', () => {
    assert.equal(nameFromText('Costs much less', ['smallReader', 'largeReader']), 'costsMuch');
    assert.equal(nameFromText('Costs much less', ['SmallReader', 'LargeReader']), 'CostsMuch');
  });

  test('the dominant style wins, and a name that shows no style does not vote', () => {
    const names = ['small_reader', 'large_reader', 'eyes', 'priceList', 'question'];
    assert.equal(nameFromText('Costs much', names), 'costs_much');
    assert.deepEqual(nameStyleOf(names), { casing: 'snake', words: 2, prefix: 'none' });
    assert.deepEqual(nameStyleOf([]), { casing: 'snake', words: 3, prefix: 'none' });
  });

  test('it follows a prefix made from the kind, in full or by its first letter, once the kind is given', () => {
    const initials = new Map([
      ['o_small_reader', 'Option'],
      ['o_large_reader', 'Option'],
      ['r_eyes', 'Reason'],
    ]);
    assert.equal(nameFromText('Costs much less', initials, 'Option'), 'o_costs_much');
    assert.equal(nameFromText('Costs much less', initials, 'Reason'), 'r_costs_much');
    assert.equal(nameFromText('Costs much less', initials), 'costs_much');
    const full = new Map([
      ['optionSmallReader', 'Option'],
      ['optionLargeReader', 'Option'],
    ]);
    assert.equal(nameFromText('Costs much', full, 'Option'), 'optionCostsMuch');
  });

  test('it is never one the graph already has: _2, _3 … in snake_case', () => {
    assert.equal(nameFromText('Large reader', ['large_reader', 'small_reader']), 'large_reader_2');
    assert.equal(nameFromText('Large reader', ['large_reader', 'large_reader_2', 'small_reader']), 'large_reader_3');
  });

  test('the number is written in the style of the names: 2 after camelCase and PascalCase', () => {
    assert.equal(nameFromText('Large reader', ['largeReader', 'smallReader']), 'largeReader2');
    assert.equal(nameFromText('Large reader', ['LargeReader', 'SmallReader']), 'LargeReader2');
  });

  test('a name differing only by case counts as taken', () => {
    assert.equal(nameFromText('Large reader', ['Large_Reader']), 'large_reader_2');
  });

  test('a name taken is kept off whether the names are an array, a set or a map', () => {
    assert.equal(nameFromText('Eyes', new Set(['eyes'])), 'eyes_2');
    assert.equal(nameFromText('Eyes', new Map([['eyes', 'Reason']])), 'eyes_2');
  });

  test('accents are dropped, and a name never starts with a digit', () => {
    assert.equal(nameFromText('Café crème', []), 'cafe_creme');
    assert.equal(nameFromText('3 big readers', []), 'item_3_big');
  });

  test('a text with no word in it gives a name that is still a name', () => {
    assert.equal(nameFromText('?!', []), 'thing');
    assert.equal(nameFromText('', ['thing']), 'thing_2');
  });

  test('a long text gives a name of a sensible length, cut at a word', () => {
    const name = nameFromText('Extraordinarily comprehensive documentation', []);
    assert.equal(name, 'extraordinarily_comprehensive');
    assert.ok(nameFromText('x'.repeat(80), []).length <= 32);
  });

  test('whatever the text, the name is one the graph can read: letters, digits and underscores, not starting with a digit', () => {
    for (const text of ['Ünïcödé ½ thing', '  ', '日本語', "it's 100% (really) — a-b/c", 'Set', '😀 smile', '42']) {
      assert.match(nameFromText(text, []), /^[A-Za-z_]\w*$/, text);
    }
  });

  test('a word the language keeps for itself is never the name: it is numbered like a name taken', () => {
    for (const word of ['Match', 'Set', 'True', 'FALSE', 'null', 'Insert', 'where', 'Return', 'graph', 'Id', 'date']) {
      assert.equal(nameFromText(word, []), `${word.toLowerCase()}_2`, word);
    }
    assert.equal(nameFromText('Set', ['setUp', 'tearDown'], undefined), 'set2', 'in the style of the names');
    assert.equal(nameFromText('Set the table', []), 'set_table', 'a word among others is no trouble');
  });
});

describe('the words of a text', () => {
  // the graph reader accepts only A–Z, a–z, digits and _ in a name (tokens.js, and lexer.py in the Python library), so an
  // accent is taken off its letter and a word in another script has no name to give
  test('lowercase, plain ASCII, with accents taken off, hyphens and apostrophes closed up and other marks parting words', () => {
    assert.deepEqual(nameWords('Café — crème brûlée!'), ['cafe', 'creme', 'brulee']);
    assert.deepEqual(nameWords("Don't e-ink; a/b"), ['dont', 'eink', 'a', 'b']);
  });

  test('a word in another script is left out, and a text of nothing else has no words', () => {
    assert.deepEqual(nameWords('東京駅 station'), ['station']);
    assert.deepEqual(nameWords('東京駅'), []);
    assert.equal(nameFromText('東京駅 station', []), 'station');
  });

  test('a text with no ASCII letter left is named from the kind, else thing, and numbered like any name taken', () => {
    assert.equal(nameFromText('東京駅', [], 'Tag'), 'tag');
    assert.equal(nameFromText('東京駅', ['tag'], 'Tag'), 'tag_2');
    assert.equal(nameFromText('東京駅', []), 'thing');
    assert.equal(nameFromText('?!', ['thing']), 'thing_2');
  });

  test('the slug of a text is its words joined by _, the same step the name takes, as one small function', () => {
    assert.equal(nameSlug('Large e-ink reader'), 'large_eink_reader');
    assert.equal(nameSlug('Café crème'), 'cafe_creme');
    assert.equal(nameSlug('The size of it'), 'the_size_of_it');
    assert.equal(nameSlug('3 big readers'), 'item_3_big_readers');
    assert.equal(nameSlug('東京駅', 'Tag'), 'tag');
    assert.equal(nameSlug('東京駅'), 'thing');
    assert.equal(nameSlug('x'.repeat(80)).length, 32);
    assert.match(nameSlug('東京駅 😀', 'My kind!'), /^[A-Za-z_]\w*$/);
  });

  test('small words are kept: the words are the text’s, and choosing among them is the name’s business', () => {
    assert.deepEqual(nameWords('The size of it'), ['the', 'size', 'of', 'it']);
  });
});

describe('a text from a name', () => {
  test('words of the name, in sentence case', () => {
    assert.equal(textFromName('large_reader'), 'Large reader');
    assert.equal(textFromName('largeReader'), 'Large reader');
    assert.equal(textFromName('LargeReader'), 'Large reader');
    assert.equal(textFromName('easy_on_the_eyes'), 'Easy on the eyes');
  });

  test('a number kept, an acronym kept, a doubled separator ignored', () => {
    assert.equal(textFromName('large_reader_2'), 'Large reader 2');
    assert.equal(textFromName('ISBN_number'), 'ISBN number');
    assert.equal(textFromName('a__b'), 'A b');
  });

  test('a name in capitals is read as words, not as an acronym', () => {
    assert.equal(textFromName('LARGE_READER'), 'Large reader');
  });

  test('nothing gives nothing', () => {
    assert.equal(textFromName(''), '');
    assert.equal(textFromName('_'), '');
  });
});

describe('the table every reader shares', () => {
  // unnamed_drawn_suggested (spec §4, Roger, 10 Oct 2026): a thing written without a name is drawn under its suggested
  // name by every reader alike, so the Python library suggests the names the core does — the same words, casing,
  // numbering and reserved words. Both are held to one table, python/graph_spec/tests/name_cases.json, which the Python
  // tests read too.
  const TABLE = JSON.parse(readFileSync(new URL('../../../python/graph_spec/tests/name_cases.json', import.meta.url)));
  const PY_SRC = fileURLToPath(new URL('../../../python/graph_spec/src', import.meta.url));
  const namesOf = (names) => (Array.isArray(names) ? names : new Map(Object.entries(names)));

  test('the core and the Python library give every answer in the table', () => {
    const core = {
      from_text: TABLE.from_text.map((c) => nameFromText(c.text, namesOf(c.names), c.kind ?? undefined)),
      styles: TABLE.styles.map((c) => nameStyleOf(namesOf(c.names))),
      words: TABLE.words.map(([text]) => nameWords(text)),
    };
    const program = [
      'import json, sys',
      `sys.path.insert(0, ${JSON.stringify(PY_SRC)})`,
      'import gql_profile as gp',
      't = json.load(sys.stdin)',
      "print(json.dumps({'from_text': [gp.name_from_text(c['text'], c['names'], c['kind']) for c in t['from_text']],",
      "  'styles': [gp.name_style_of(c['names']) for c in t['styles']],",
      "  'words': [gp.name_words(w) for w, _ in t['words']]}))",
    ].join('\n');
    const r = spawnSync('python3', ['-c', program], { input: JSON.stringify(TABLE), encoding: 'utf8' });
    const expected = {
      from_text: TABLE.from_text.map((c) => c.name),
      styles: TABLE.styles.map((c) => c.style),
      words: TABLE.words.map(([, w]) => w),
    };
    assert.deepEqual(core, expected, 'the core');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), expected, 'the Python library');
  });
});
