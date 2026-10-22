// The diagram types looked at in reading view, never saved (spec §15, type_try_reading). One for each graph or view of
// each note, held until Obsidian closes, as the View menu's switches are. A card is drawn as the type held, if any. It
// says it is not saved, and where the note is edited offers to keep it. Choosing a type there saves it and forgets this.
import { chosenDiagram, diagramFor } from '@thoughtknot/core';
import type { DiagramWrite, GraphDrawing, NoteReading, StyleGraph } from '@thoughtknot/core';
import { withTried } from '@thoughtknot/core/display/graph-view/type-strip';
import type { Trying, TypeLeftAt } from '@thoughtknot/core/display/graph-view/type-strip';

/** How long where a card was left waits for the card drawn as its new type: a type saved draws it once written. */
const LEFT_FOR_MS = 10_000;

/** Where a type is looked at: the note, its graph, and the view, if the card shows one. */
export interface TriedAt {
  path: string;
  graph: string;
  view?: string;
}

/** The types looked at, and the cards to draw again when one changes. */
export class TriedTypes {
  private readonly held = new Map<string, DiagramWrite>();
  private readonly watchers = new Set<(path: string) => void>();
  /** Where each card was left as its type changed, and when (§15, type_keeps_place). */
  private readonly left = new Map<string, { at: TypeLeftAt; when: number }>();

  private static key(at: TriedAt): string {
    return [at.path, at.graph, at.view ?? ''].join('\u0000');
  }

  /** The type looked at where `at` says, or undefined. */
  of(at: TriedAt): DiagramWrite | undefined {
    return this.held.get(TriedTypes.key(at));
  }

  /** Looks at `change` where `at` says, or, given null, goes back to the saved type; then draws its note's cards again. */
  set(at: TriedAt, change: DiagramWrite | null): void {
    if (change) this.held.set(TriedTypes.key(at), change);
    else if (!this.held.delete(TriedTypes.key(at))) return;
    for (const changed of [...this.watchers]) changed(at.path);
  }

  /** Forgets the type looked at where `at` says, drawing nothing again: for a type about to be saved. */
  forget(at: TriedAt): void {
    this.held.delete(TriedTypes.key(at));
  }

  /** Keeps where the card at `at` is, as its type changes, for the card drawn next. */
  leave(at: TriedAt, where: TypeLeftAt): void {
    this.left.set(TriedTypes.key(at), { at: where, when: Date.now() });
  }

  /** Where the card at `at` was left as its type changed, once, unless it waited too long for its card. */
  kept(at: TriedAt): TypeLeftAt | undefined {
    const key = TriedTypes.key(at),
      left = this.left.get(key);
    this.left.delete(key);
    return left && Date.now() - left.when <= LEFT_FOR_MS ? left.at : undefined;
  }

  /** Calls `changed` with the note's path whenever a type is looked at or put back; gives what stops it. */
  watch(changed: (path: string) => void): () => void {
    this.watchers.add(changed);
    return () => this.watchers.delete(changed);
  }

  /**
   * The style to draw `drawing` with where `at` says: as saved, or with the type looked at. It comes with how its card
   * looks at a type, for `diagramShown`.
   */
  styleFor(
    at: TriedAt,
    drawing: Pick<GraphDrawing, 'boxes' | 'links' | 'estimates'>,
    style: StyleGraph,
    g: NoteReading['world'][string] | undefined,
  ): { style: StyleGraph; trying: Trying } {
    const tried = this.of(at),
      saved = diagramFor(drawing, style, g, at.view).drawn,
      centre = saved === 'radial' ? chosenDiagram(style, at.view)?.centre : undefined;
    return {
      style: tried ? withTried(style, tried) : style,
      trying: {
        saved,
        ...(centre === undefined ? {} : { savedCentre: centre }),
        tried: !!tried,
        tryOut: (change) => this.set(at, change),
        leave: (where) => this.leave(at, where),
        kept: () => this.kept(at),
      },
    };
  }
}
