// The editing view's own cards (spec §4, "The page stays still"; Roger's choice C, 9 Oct 2026). Obsidian draws a code
// block in Live Preview with a widget it builds again whenever the block's text changes, so a card being typed in was
// torn down and drawn again on every write, and CodeMirror, finding it a different height meanwhile, moved the page.
// Here the plugin draws each graph block with a widget of its own: redrawn in place, the old drawing kept on the page
// until the new one is ready, and CodeMirror told the card's last height, so it has nothing to correct.
import { Prec, StateField } from '@codemirror/state';
import type { EditorState, Extension, Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { Component, editorInfoField, editorLivePreviewField } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { gqlSpans, graphOfBlock, styleOf, viewsOf } from '@graph-note/core';
import type GraphNotePlugin from './main';
import { renderShown } from './block';
import { settlePlacements } from './graph-view/placement';

/** The last height each card was seen at, by its note and line: what CodeMirror is told while the card is redrawn. */
const heights = new Map<string, number>();

/** What each card on the page has: the drawing's lifecycle, its watcher, and the latest drawing asked for. */
interface Drawn {
  component: Component | null;
  observer: ResizeObserver | null;
  asked: number;
}
const drawn = new WeakMap<HTMLElement, Drawn>();

/** One graph block, drawn in the editing view. */
class GraphBlock extends WidgetType {
  constructor(
    private readonly plugin: GraphNotePlugin,
    private readonly path: string,
    private readonly open: number,
    private readonly close: number,
    private readonly source: string,
    /** Every gql block's text, joined: what the drawing is built from, beyond this block's own. */
    private readonly blocks: string,
    private readonly note: string,
  ) {
    super();
  }

  /** Which card this is: its note and the line its fence opens on. */
  get key(): string {
    return `${this.path}|${this.open}`;
  }

  /** The same drawing: same card, same text and same blocks around it. Prose typed elsewhere changes nothing. */
  override eq(other: WidgetType): boolean {
    return other instanceof GraphBlock && other.key === this.key && other.blocks === this.blocks;
  }

  override toDOM(): HTMLElement {
    const dom = createDiv({ cls: 'graph-note-block cm-embed-block markdown-rendered' });
    const state: Drawn = { component: null, observer: null, asked: 0 };
    drawn.set(dom, state);
    if (typeof ResizeObserver !== 'undefined') {
      state.observer = new ResizeObserver(() => {
        const h = dom.getBoundingClientRect().height;
        if (h > 0) this.measured(dom, h);
      });
      state.observer.observe(dom);
    }
    this.draw(dom);
    return dom;
  }

  /** A changed block in the same card: redrawn in the same element, never built again. */
  override updateDOM(dom: HTMLElement): boolean {
    const state = drawn.get(dom);
    if (!state || dom.getAttribute('data-card') !== this.key) return false;
    this.draw(dom);
    return true;
  }

  /** The card's height, as last seen. */
  measured(dom: HTMLElement, height: number): void {
    heights.set(dom.getAttribute('data-card') ?? this.key, height);
  }

  override get estimatedHeight(): number {
    return heights.get(this.key) ?? -1;
  }

  /** Clicks, keys and typing in the card are the card's, not the editor's. */
  override ignoreEvent(): boolean {
    return true;
  }

  /** The card is gone: its watcher stops, its drawing is unloaded, and one still being drawn is dropped when it is ready. */
  override destroy(dom: HTMLElement): void {
    const state = drawn.get(dom);
    drawn.delete(dom);
    if (!state) return;
    state.asked++;
    state.observer?.disconnect();
    state.component?.unload();
    state.component = null;
  }

  /** Draws the block off the page, then puts it in place of the old drawing: the card never shrinks between. */
  private draw(dom: HTMLElement): void {
    const state = drawn.get(dom);
    if (!state) return;
    dom.setAttribute('data-card', this.key);
    const asked = ++state.asked;
    const component = new Component();
    component.load();
    const el = createDiv({ cls: 'block-language-gql' });
    const ctx = {
      sourcePath: this.path,
      docId: '',
      frontmatter: undefined,
      getSectionInfo: () => ({ text: this.note, lineStart: this.open, lineEnd: this.close }),
      addChild: (child: Component) => component.addChild(child),
    } as unknown as MarkdownPostProcessorContext;
    void renderShown(this.plugin, this.source, el, ctx, state).then(
      () => {
        if (asked !== state.asked || !drawn.has(dom)) {
          component.unload(); // a later drawing was asked for meanwhile
          return;
        }
        state.component?.unload();
        state.component = component;
        dom.replaceChildren(el);
        settlePlacements(); // the editor in place moves into the new drawing now, never a moment later
        const h = dom.getBoundingClientRect().height;
        if (h > 0) this.measured(dom, h);
      },
      (e: unknown) => {
        component.unload();
        console.error('Graph Note could not draw a block', e);
      },
    );
  }
}

/** The editing view's cards for a document: one block widget over each graph block's fences, in Live Preview only. */
function cards(plugin: GraphNotePlugin, state: EditorState): DecorationSet {
  if (!state.field(editorLivePreviewField, false)) return Decoration.none;
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path) return Decoration.none;
  const note = state.doc.toString(),
    spans = gqlSpans(note),
    blocks = spans.map((s) => s.text).join('\u0000'),
    out: Range<Decoration>[] = [];
  for (const s of spans) {
    // a graph, a view and a style block are drawn from the other blocks too, so each gets a card that redraws with them;
    // a plain query, a schema, or a block not yet closed is left to Obsidian
    const drawnFromOthers = !!graphOfBlock(s.text) || !!styleOf(s.text) || viewsOf([s.text]).length > 0;
    if (!drawnFromOthers || s.close >= state.doc.lines) continue;
    const widget = new GraphBlock(plugin, path, s.open, s.close, s.text, blocks, note);
    out.push(
      Decoration.replace({ widget, block: true }).range(
        state.doc.line(s.open + 1).from,
        state.doc.line(s.close + 1).to,
      ),
    );
  }
  return Decoration.set(out);
}

/** The editor extension: the cards, ahead of Obsidian's own drawing of the same blocks. */
export function graphBlocks(plugin: GraphNotePlugin): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => cards(plugin, state),
    update: (set, tr) =>
      tr.docChanged ||
      tr.startState.field(editorLivePreviewField, false) !== tr.state.field(editorLivePreviewField, false)
        ? cards(plugin, tr.state)
        : set,
    provide: (f) => EditorView.decorations.from(f),
  });
  // each editor open on a note, so what is typed in a card can be written through it, never behind its back
  const editors = ViewPlugin.define((view) => {
    plugin.editorViews.add(view);
    return { destroy: () => plugin.editorViews.delete(view) };
  });
  return [Prec.highest(field), editors];
}
