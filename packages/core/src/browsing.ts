// Moving between altitudes leaves no links (editor spec §32, browsing_leaves_no_links). Each move up, down or sideways
// is logged as passing, and fades. Only a descent followed by a consequence persists. A consequence is a new link, a
// note, a changed query or a reference. That descent is then kept as a link labelled as bearing a consequence.

/** A move between altitudes. */
export interface AltitudeMove {
  from: string;
  to: string;
  kind: 'descend' | 'ascend' | 'sideways';
  /** When, in milliseconds. */
  at: number;
}

/** What makes a descent worth keeping. */
export type Consequence = 'link' | 'note' | 'query' | 'reference';

/** A descent kept because something followed it: the link to write, and why. */
export interface KeptDescent {
  from: string;
  to: string;
  label: 'consequence-bearing';
  because: Consequence;
}

/** How long a passing move stays in the log before it fades, in milliseconds. */
export const FADE_AFTER = 10 * 60 * 1000;

/** The moves of one session, passing unless a consequence follows a descent. */
export class AltitudeTrail {
  private moves: AltitudeMove[] = [];
  private kept: KeptDescent[] = [];

  /** A move, logged as passing. It makes no link. */
  move(m: AltitudeMove): void {
    this.moves.push({ ...m });
  }

  /** Something that followed the last move. When that move was a descent, it is kept as a labelled link. */
  consequence(because: Consequence): KeptDescent | null {
    const last = this.moves.at(-1);
    if (!last || last.kind !== 'descend') return null;
    const kept: KeptDescent = { from: last.from, to: last.to, label: 'consequence-bearing', because };
    if (!this.kept.some((k) => k.from === kept.from && k.to === kept.to)) this.kept.push(kept);
    return kept;
  }

  /** The moves still in the log at `now`: those that have not faded yet. */
  log(now: number): AltitudeMove[] {
    this.moves = this.moves.filter((m) => now - m.at <= FADE_AFTER);
    return this.moves.map((m) => ({ ...m }));
  }

  /** The descents kept as links. Plain moves are never among them. */
  links(): KeptDescent[] {
    return this.kept.map((k) => ({ ...k }));
  }
}
