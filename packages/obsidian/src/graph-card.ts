// A drawn card as Obsidian owns it. The card itself is the display layer's (`@thoughtknot/core/display`), with a lifecycle of
// its own and no Obsidian in it. Obsidian wants a component, to unload with the note's block, the pane or the page. So the
// card is wrapped in a `MarkdownRenderChild` over the same element that loads and unloads it with itself.
import { MarkdownRenderChild } from 'obsidian';
import { GraphView } from '@thoughtknot/core/display/graph-view/graph-view';
import type { ViewOptions } from '@thoughtknot/core/display/graph-view/view-options';

/** Obsidian's component for one card: loaded and unloaded as it is, the card with it. */
class GraphCard extends MarkdownRenderChild {
  private readonly view: GraphView;

  constructor(containerEl: HTMLElement, view: GraphView) {
    super(containerEl);
    this.view = view;
  }

  /** What the card was given, which the plugin's tests reach the card by. */
  get o(): ViewOptions {
    return this.view.o;
  }

  override onload(): void {
    this.view.load();
  }

  override onunload(): void {
    this.view.unload();
  }
}

/** A graph drawn in `root`, as a component for Obsidian to own: add it as a child to put it on the page. */
export function graphCard(root: HTMLElement, options: ViewOptions): MarkdownRenderChild {
  return new GraphCard(root, new GraphView(root, options));
}
