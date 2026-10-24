// Certainty, drawn (editor spec §36, certainty_drawn): certainty-drawn.ts. A thing whose certainty is written is drawn
// so a reader can tell how sure it is without its label, and never by colour alone. Each level has its own line weight
// and dash, and all but the surest have a mark in words. The look is a style token, never a colour.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CERTAINTY_LEVELS, CERTAINTY_LOOKS, certaintyLevel } from '../src/certainty-drawn.ts';
import { readNote } from '../src/drawing.ts';
import { word } from '../src/words.ts';

const GRAPH = `// graph: g
(rain:Claim {text: 'It will rain', likelihood: 'almost-certain'}),
(wind:Claim {text: 'It will be windy', likelihood: 'likely'}),
(snow:Claim {text: 'It will snow', likelihood: 'unlikely'}),
(fog:Claim {text: 'It will be foggy', status: 'contested'}),
(sun:Claim {text: 'The sun will rise'})`;
const boxOf = (key) =>
  readNote([GRAPH])
    .graphs.get('g')
    .boxes.find((b) => b.key === key);

describe('certainty_drawn', () => {
  test('each level is told apart by line weight and dash, with no colour', () => {
    const looks = CERTAINTY_LEVELS.map((l) => CERTAINTY_LOOKS[l]);
    const shapes = new Set(looks.map((l) => `${l.lineWidth}/${l.dash?.join(',') ?? 'solid'}`));
    assert.equal(shapes.size, CERTAINTY_LEVELS.length, 'no two levels share a line weight and dash');
    for (const look of looks) {
      assert.ok(!Object.keys(look).some((k) => /colou?r|fill|stroke$/i.test(k)), 'no colour in the look');
      assert.match(look.style, /^thing\.certainty\./, 'reaches the drawing as a style token');
    }
  });

  test('all but the surest have a mark in words, so it reads without the label', () => {
    for (const level of CERTAINTY_LEVELS.filter((l) => l !== 'sure')) {
      const mark = CERTAINTY_LOOKS[level].mark;
      assert.ok(mark);
      assert.match(word(mark), /[a-z]{4,}/, `${level}: a word, not a sign alone`);
    }
    assert.equal(CERTAINTY_LOOKS.sure.mark, null);
  });

  test('the level comes from a likelihood word, or from being contested', () => {
    assert.equal(certaintyLevel({ likelihood: 'very-likely' }), 'sure');
    assert.equal(certaintyLevel({ likelihood: 'even-chance' }), 'likely');
    assert.equal(certaintyLevel({ likelihood: 'cannot-judge' }), 'doubtful');
    assert.equal(certaintyLevel({ likelihood: 'likely', status: 'contested' }), 'contested');
    assert.equal(certaintyLevel({ likelihood: 'maybe' }), null, 'a word not in the list is not guessed');
    assert.equal(certaintyLevel({}), null);
  });

  test('a drawing carries each thing’s level, and a thing with none is drawn as before', () => {
    assert.equal(boxOf('rain').certainty, 'sure');
    assert.equal(boxOf('wind').certainty, 'likely');
    assert.equal(boxOf('snow').certainty, 'doubtful');
    assert.equal(boxOf('fog').certainty, 'contested');
    assert.ok(!('certainty' in boxOf('sun')));
  });
});
