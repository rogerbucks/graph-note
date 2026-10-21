// The words a style graph is written in, checked (editor spec §2, style_words_checked). A key the style graph does not
// know is a problem, with the nearest known key as its fix. So is a frame that is not a well-formed list of numbers,
// with the list rewritten with its stray parts removed. A view's name is the user's own and is never checked here or
// anywhere.
import { nearest } from './estimates.ts';
import type { Problem } from './note-reading.ts';
import { STYLE_KEYS, article, orList, styleProblem } from './style-graph.ts';
import type { Frame, StyleAt, StyleKind } from './style-graph.ts';
import { trim } from './whitespace.ts';
import { word } from './words.ts';

/**
 * A problem for each key written on a thing of `kind` that the style graph does not know, on the key itself
 * (`keySpan`). The fix is the nearest known key the thing does not already write (`estimates.ts`'s `nearest`, as a
 * name's estimate is found). Of several equally near, it is each of them. With none near, it is the keys to choose
 * from, and nothing to apply.
 */
export function unknownKeys(
  kind: StyleKind,
  written: string[],
  keySpan: (key: string) => Problem['span'],
  graph: string,
  at: StyleAt,
): Problem[] {
  const known = STYLE_KEYS[kind];
  return written
    .filter((k) => k !== 'id' && !known.includes(k))
    .map((k) => {
      const near = nearest(
          k,
          known.filter((c) => !written.includes(c)),
        ),
        by = !near ? [] : 'one' in near ? [near.one] : near.several,
        span = keySpan(k);
      return styleProblem(
        graph,
        at,
        // the kind is the style graph's own label, such as Look or Arrows, so it takes the article English gives it
        word(article(kind) === 'an' ? 'styling.key-unknown.an' : 'styling.key-unknown.a', { key: k, kind }),
        by.length > 1
          ? word('styling.change-to-meant', { written: k, among: orList(by) })
          : by.length
            ? word('styling.change-to', { written: k, to: orList(by) })
            : word('styling.key.fix', { key: k, among: orList(known) }),
        { ...(by.length ? { replace: { written: k, with: by } } : {}), ...(span ? { span } : {}) },
      );
    });
}

/** What a frame says is wrong with it, how to put it right, and, when the stray parts can be removed, the list without them. */
export interface FrameFault {
  message: string;
  fix: string;
  /** The list rewritten with its stray commas and spaces removed, when that is the fix to apply. */
  clean?: string;
}

/** What a frame that is not four numbers says, and its fix, in the reader's language. */
const four = (): FrameFault => ({ message: word('styling.frame.four'), fix: word('styling.frame.four.fix') });
/**
 * A number as a frame is written, by `styleEdit` or by hand. It is an optional sign, digits with an optional dot (`5.`)
 * or a dot and digits (`.5`), and an optional exponent. Never hexadecimal (`0x10`), which `Number` would read.
 */
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * A frame, `x,y,width,height`, read from its text. It is four numbers, joined by single commas, with no space and no
 * comma at either end. The numbers are integers or decimals, signed, with an exponent as `styleEdit` writes a very
 * small or large one. A frame that is not text, or has a part that is not a number, is a fault with no repair. The only
 * fault may be stray commas and spaces (an empty part, a space around a number). Then the fault carries the list
 * without them. If that is still not four numbers the fault says so, and the fix is still to remove the strays.
 */
export function readFrame(written: unknown): { frame: Frame } | FrameFault {
  if (typeof written !== 'string') return four();
  const kept = written
    .split(',')
    .map(trim)
    .filter((part) => part !== '');
  if (!kept.length || !kept.every((part) => NUMBER.test(part) && Number.isFinite(Number(part)))) return four();
  const clean = kept.join(','),
    numbers = kept.length === 4;
  if (clean !== written)
    return {
      message: word(numbers ? 'styling.frame.stray' : 'styling.frame.stray-not-four', { written }),
      fix: word(numbers ? 'styling.frame.stray.fix' : 'styling.frame.stray-not-four.fix', { clean }),
      clean,
    };
  if (!numbers) return four();
  const [x = 0, y = 0, width = 0, height = 0] = kept.map(Number);
  return { frame: { x, y, width, height } };
}
