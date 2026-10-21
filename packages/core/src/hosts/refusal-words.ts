// Why a graph is not laid out, in words (spec §9, layout_contained, and §16, failed_export). It gives the limit it is
// over and the numbers, how long its layout was given, or that drawing is paused. One telling of each reason, in two
// voices. One is the banner over a graph shown as text instead. One is the notice of an export that was stopped and
// wrote nothing. Each is said in the reader's language, from the catalogue (drawing-source-words.ts). A host-side
// module imports only types from the core, so the host hands in how words and numbers are said (`Say`).
import type { Refusal } from '../layout-limits.ts';
import type { LayoutFailure } from '../layout-worker.ts';
import type { WordKey, WordValues } from '../words.ts';

/** How the host says words and numbers: the core's `word`, `formatCount` and `formatSize`. */
export interface Say {
  word: (key: WordKey, values?: WordValues) => string;
  formatCount: (n: number) => string;
  formatSize: (bytes: number) => string;
}

type TooLarge = Extract<Refusal, { reason: 'too-large' }>;

/** Whether the limit is on the note's text, which is never read, rather than on the drawing. */
const ofText = (r: TooLarge) => r.limit === 'text-bytes' || r.limit === 'text-lines';

/** What is over the limit, and the limit, in words that follow a colon: what is `drawn`, or what is `laid out`. */
function overWhat(r: TooLarge, counted: 'drawn' | 'laid-out', say: Say): string {
  const { word, formatCount, formatSize } = say;
  const most = r.limit === 'text-bytes' || r.limit === 'source' ? formatSize(r.most) : formatCount(r.most);
  const values = { size: formatCount(r.count), most };
  switch (r.limit) {
    case 'text-bytes':
      return word('refusal.over.text-bytes', { size: formatSize(r.count), most });
    case 'text-lines':
      return word('refusal.over.text-lines', values);
    case 'source':
      return word(r.atLeast ? 'refusal.over.source-at-least' : 'refusal.over.source', {
        size: formatSize(r.count),
        most,
      });
    case 'word':
      return word(counted === 'drawn' ? 'refusal.over.word-drawn' : 'refusal.over.word-laid-out', values);
    case 'links':
      return word(counted === 'drawn' ? 'refusal.over.links-drawn' : 'refusal.over.links-laid-out', values);
    default:
      return word(counted === 'drawn' ? 'refusal.over.things-drawn' : 'refusal.over.things-laid-out', values);
  }
}

/** The sentence a refusal on the page's own thread adds, or nothing: there a layout cannot be stopped, so its limits are lower. */
const onPage = (r: TooLarge, say: Say): string[] => (r.page ? [say.word('refusal.page')] : []);

/** The banner's words. */
export function refusalWords(r: Refusal, say: Say): string {
  const { word } = say;
  const instead = word('refusal.instead');
  if (r.reason === 'timed-out') return [word('refusal.timed-out', { count: r.ms / 1000 }), instead].join(' ');
  if (r.reason === 'stopped') return [word('refusal.stopped', { failures: String(r.failures) }), instead].join(' ');
  const over = overWhat(r, 'drawn', say);
  const head = word(ofText(r) ? 'refusal.too-large-to-read' : 'refusal.too-large-to-draw', { over });
  return [head, ...onPage(r, say), instead].join(' ');
}

/**
 * The notice of an export that was stopped for a limit, in the words of every export that cannot be made. It says what
 * happened, why, that nothing was saved, and what to do.
 */
export function exportRefusalWords(r: Refusal, say: Say): string {
  const { word } = say;
  if (r.reason === 'timed-out') return word('refusal.export.timed-out', { count: r.ms / 1000 });
  if (r.reason === 'stopped') return word('refusal.export.stopped', { failures: String(r.failures) });
  const todo = ofText(r)
    ? word('refusal.export.move-graphs')
    : r.limit === 'word'
      ? word('refusal.export.shorten')
      : word('refusal.export.smaller');
  const over = word('refusal.export.too-large', { over: overWhat(r, 'laid-out', say) });
  return [over, ...onPage(r, say), word('exporting.nothing-saved'), todo].join(' ');
}

/** Whether `error` is a layout's failure, told by its stage (layout-worker.ts). */
const isLayoutFailure = (error: unknown): error is LayoutFailure =>
  error instanceof Error && error.name === 'LayoutFailure';

/**
 * The notice of an export whose layout failed: the layout worker or its engine raised `error`. Its reason is put in
 * brackets. So a worker that failed with "boom" is told as "the layout worker failed (boom)". Then it says that
 * nothing was saved and what to do.
 */
export function exportFailureWords(error: unknown, say: Say): string {
  const { word } = say;
  const message = error instanceof Error ? error.message : String(error);
  const why = isLayoutFailure(error)
    ? error.stage === 'start'
      ? word('refusal.layout.could-not-start', {
          why: error.slow ? word('refusal.layout.slow-start') : error.why,
        })
      : word('refusal.layout.failed', { why: error.why })
    : word('refusal.layout.failed', { why: message });
  return word('refusal.export.failed', { why });
}
