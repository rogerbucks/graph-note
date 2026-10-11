// Where an estimated name is written in its block (spec §3), so its fix changes it there and nowhere else: at the link's
// own reference to it, never the same word in a text or a comment on its line, nor in another link on the same line.
// Each place is a 0-based line of the block and the characters the word spans on it, as a problem's `span` gives one.
// Host-free.
import { blankText, items, lineIndex } from './block-items.ts';
import type { Item } from './block-items.ts';
import { S } from './whitespace.ts';

/** A word's place: a 0-based line of the block, and the characters it spans on it. */
export interface Place {
  line: number;
  character: number;
  end: number;
}

/** A word written, and what it was taken to mean. */
interface Taken {
  written: string;
  taken: string;
}

/** A name written as a thing in a pattern: an opening bracket, then the name. */
const REFERENCE = new RegExp(`\\(${S}*([A-Za-z_]\\w*)`, 'g');
/** An item's text as compared: strings and comments blanked, and the spaces, colons and commas a reader adds left out. */
const compared = (text: string) => blankText(text).replace(new RegExp(`(${S}|[:,])+`, 'g'), '');

/** One block's items, found once for every estimate in it, each by the lines it spans. */
export class BlockPlaces {
  private readonly text: string;
  private readonly all: Item[];
  private readonly lineOf: (pos: number) => number;
  private readonly byLine = new Map<number, number[]>();
  private readonly used = new Set<number>();

  /** For the block whose text this is. */
  constructor(text: string) {
    this.text = text;
    this.all = items(text);
    this.lineOf = lineIndex(text);
    this.all.forEach((it, i) => {
      for (let l = this.lineOf(it.from); l <= this.lineOf(Math.max(it.from, it.to - 1)); l++) {
        const here = this.byLine.get(l);
        if (here) here.push(i);
        else this.byLine.set(l, [i]);
      }
    });
  }

  /** Where a word starting at `pos` of the block, `length` long, is: its 0-based line and characters. */
  private placeOf(pos: number, length: number): Place {
    const start = this.text.lastIndexOf('\n', pos - 1) + 1;
    return { line: this.lineOf(pos) - 1, character: pos - start, end: pos - start + length };
  }

  /**
   * For the path left out as `dropped`, read on 1-based `line`, naming `missing`, which is not in the graph: the place of
   * its reference to `missing`, and of each other reference it makes to a name in `words`, with what to write there. Each
   * item is taken once, so two paths written alike on one line are found in turn. Null when the path is not found whole.
   */
  names(
    line: number,
    dropped: string,
    missing: string,
    words: Taken[],
  ): { place: Place; also: { span: Place; text: string }[] } | null {
    const want = compared(dropped);
    const at = (this.byLine.get(line) ?? []).find((i) => {
      const it = this.all[i] as Item;
      return !this.used.has(i) && compared(this.text.slice(it.from, it.to)) === want;
    });
    if (at === undefined) return null;
    this.used.add(at);
    const it = this.all[at] as Item;
    let place: Place | null = null;
    const also: { span: Place; text: string }[] = [];
    for (const m of blankText(this.text.slice(it.from, it.to)).matchAll(REFERENCE)) {
      const name = m[1] ?? '',
        word = words.find((w) => w.written === name);
      if (!word) continue;
      const here = this.placeOf(it.from + (m.index ?? 0) + m[0].length - name.length, name.length);
      if (!place && name === missing) place = here;
      else also.push({ span: here, text: word.taken });
    }
    return place ? { place, also } : null;
  }
}
