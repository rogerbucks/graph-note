// Why a graph is not laid out, in words (spec §9, layout_contained, and §16, failed_export). One is the banner over a
// graph shown as text. One is the notice of an export that was stopped. Each says the limit and the numbers, or that
// drawing is paused. They say it in the person's language, from the catalogue (editor spec §42, words_catalogue).
import { afterEach, test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportFailureWords as failure,
  exportRefusalWords as notice,
  refusalWords as banner,
} from '../src/hosts/refusal-words.ts';
import { LayoutFailure } from '../src/layout-worker.ts';
import { formatCount, formatSize } from '../src/locale-formats.ts';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { setLanguage, SOURCE_LANGUAGE, word } from '../src/words.ts';

afterEach(() => setLanguage(SOURCE_LANGUAGE));

/** How a host says the words and numbers, as each host hands them in. */
const SAY = { word, formatCount, formatSize };
const refusalWords = (r) => banner(r, SAY);
const exportRefusalWords = (r) => notice(r, SAY);
const exportFailureWords = (e) => failure(e, SAY);

/** A refusal for each limit, each way a layout is stopped, and the page's tighter limits. */
const REFUSALS = [
  { reason: 'too-large', limit: 'text-bytes', count: 600_000, most: 512_000 },
  { reason: 'too-large', limit: 'text-lines', count: 12_000, most: 10_000 },
  { reason: 'too-large', limit: 'source', count: 2_000_000, most: 1_000_000, atLeast: true },
  { reason: 'too-large', limit: 'word', count: 9000, most: 4000 },
  { reason: 'too-large', limit: 'things', count: 2500, most: 2000, page: true },
  { reason: 'too-large', limit: 'links', count: 6000, most: 5000 },
  { reason: 'timed-out', ms: 5000 },
  { reason: 'timed-out', ms: 1000 },
  { reason: 'stopped', failures: 3 },
];

describe('why a graph is not laid out', () => {
  test('is said in UK English as before: the limit, the numbers and what is shown instead', () => {
    assert.equal(
      refusalWords(REFUSALS[4]),
      'Too large to draw: this graph has 2,500 things, and at most 2,000 are drawn. Graphs are laid out on the main thread here, so the limits are lower. It is shown as text instead.',
    );
    assert.equal(
      exportRefusalWords(REFUSALS[0]),
      'The export could not be made: the graph blocks here hold 600 kB of text, and at most 512 kB is read. Nothing was saved. Move some of the graphs to another note.',
    );
    assert.equal(
      refusalWords(REFUSALS[7]),
      'Took too long to draw: laying this graph out took longer than 1 second, so it was stopped. It is shown as text instead.',
    );
  });

  // proves: words_catalogue
  test('the banner, the export’s notice and a failed layout are each said in the person’s language', () => {
    setLanguage('en-XA');
    const said = [
      ...REFUSALS.flatMap((r) => [refusalWords(r), exportRefusalWords(r)]),
      exportFailureWords(new LayoutFailure('worker', 'boom')),
      exportFailureWords(new LayoutFailure('start', 'no WebAssembly')),
      exportFailureWords(new LayoutFailure('start', 'late', true)),
      exportFailureWords(new Error('boom')),
    ];
    for (const words of said) assert.ok(isPseudoWord(words), words);
  });

  test('a failed layout is told by its stage, never by matching its words, with its reason in brackets', () => {
    assert.match(exportFailureWords(new LayoutFailure('worker', 'boom')), /: the layout worker failed \(boom\)\./);
    assert.match(
      exportFailureWords(new LayoutFailure('start', 'no WebAssembly')),
      /: the layout engine could not start \(no WebAssembly\)\./,
    );
    assert.match(
      exportFailureWords(new LayoutFailure('start', 'late', true)),
      /could not start \(the layout engine took too long to start\)/,
    );
    assert.match(
      exportFailureWords(new Error('the layout engine could not start: x')),
      /the layout worker failed \(the layout engine could not start: x\)/,
    );
  });
});
