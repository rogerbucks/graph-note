// The names of a graph, kept up to date as names are added, for naming many things written without one (editor spec
// §4). It names them without freezing the page (spec §9, layout_contained). Its style, and the names taken, are kept as
// each name is added, rather than counted again from every name for each new one. Each name it gives is the one
// nameFromText gives for the same names; test/name-book.test.js holds the two to each other.
import { composeName, emptyTally, styleOfTally, tallyName } from './name-suggestions.ts';
import type { NameStyle, NameTally } from './name-suggestions.ts';

/** A graph's names, each with its kind ('' for none), and what naming another needs of them. */
export class NameBook {
  private readonly kinds = new Map<string, string>();
  private readonly taken = new Set<string>();
  private readonly tally: NameTally = emptyTally();
  /** For each base a name was made from, in each casing: the first numbered place that may still be free. */
  private readonly from = new Map<string, number>();

  /** Adds a name with its kind, or gives a name already there its new kind. */
  set(name: string, kind: string): this {
    const old = this.kinds.get(name);
    if (old !== undefined) tallyName(this.tally, name, old, -1);
    this.kinds.set(name, kind);
    this.taken.add(name.toLowerCase());
    tallyName(this.tally, name, kind, 1);
    return this;
  }

  /** The style the names show now, as nameStyleOf finds it. */
  style(): NameStyle {
    return styleOfTally(this.tally);
  }

  /** The names, with their kinds, as nameFromText and nameStyleOf take them. */
  names(): ReadonlyMap<string, string> {
    return this.kinds;
  }

  /**
   * A name for a thing with this text and kind, as nameFromText(text, names(), kind) gives it. Names are only ever added,
   * so a numbered place once taken stays taken: counting starts where it last stopped for the same base.
   */
  name(text: string, kind?: string): string {
    const style = this.style();
    const key = (base: string) => `${style.casing} ${base}`;
    const made = composeName(
      text,
      style,
      kind,
      (lower) => this.taken.has(lower),
      (base) => this.from.get(key(base)) ?? 1,
    );
    this.from.set(key(made.base), made.place);
    return made.name;
  }
}
