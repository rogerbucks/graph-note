// The highlight (editor spec §25, hover_highlight, hover_not_alone, hover_still): pointing at a thing or a link marks it, and
// for a link the two things it joins, for as long as the pointer stays; the same mark follows keyboard focus, and on touch
// the tap that selects gives it, so nothing depends on hover (§5). It only says what is highlighted — the drawing is marked
// by classes, so nothing moves, resizes or is laid out again.
import { highlightOf } from '@graph-note/core';
import type { FocusEdge, FocusTarget, Kept } from '@graph-note/core';

/** The highlight of one drawing: what the pointer is over, what has the keyboard focus, and what a touch selected. */
export class Highlight {
  private pointer: FocusTarget | null = null;
  private keyboard: FocusTarget | null = null;
  private touch: FocusTarget | null = null;
  private readonly edges: readonly FocusEdge[];
  private readonly changed: () => void;

  /** For a drawing's links (`edgesOf`); `changed` is told whenever what is highlighted may have changed. */
  constructor(edges: readonly FocusEdge[], changed: () => void) {
    this.edges = edges;
    this.changed = changed;
  }

  /** What is highlighted now: under the pointer first, then with the keyboard focus, then what a touch selected. */
  hot(): Kept | null {
    const target = this.pointer ?? this.keyboard ?? this.touch;
    return target ? highlightOf(this.edges, target) : null;
  }

  /** The pointer is over a thing or a link, or over neither (null). */
  over(target: FocusTarget | null): void {
    this.pointer = target;
    this.changed();
  }

  /** A thing or a link has the keyboard focus, or none has (null). */
  focus(target: FocusTarget | null): void {
    this.keyboard = target;
    this.changed();
  }

  /** The thing or link a tap by touch selected, or none (null): it stays until another is chosen or the selection clears. */
  tapped(target: FocusTarget | null): void {
    this.touch = target;
    this.changed();
  }
}
