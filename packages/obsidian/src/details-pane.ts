// The details side pane (editor spec §25, details_in_host_pane). It is a view of Obsidian's own, in its right sidebar.
// A card's details are shown in it when the person chooses it from their place button. It holds one card's details at a
// time. They follow what is chosen in that card, and are the inspector while the block is edited. Closing the pane
// sends them back to their card, closed. The pane can be dragged anywhere Obsidian lets a view go: a sidebar, a split,
// a tab or a window of its own.
import { ItemView, Notice } from 'obsidian';
import type { Plugin, WorkspaceLeaf } from 'obsidian';
import type { SidePane } from '@thoughtknot/core/display/host';
import { word } from '@thoughtknot/core';
import { showPane } from './host-panels';

/** The details pane's view type. */
export const DETAILS_PANE = 'thoughtknot-details';

/** What the pane holds now: a card's details, its title, and what to tell the card when they leave without being asked. */
interface Held {
  el: HTMLElement;
  title: string;
  left: (why: 'closed' | 'taken') => void;
}

/** The details pane: one card's details at a time, or a line saying how to fill it. */
export class DetailsPaneView extends ItemView {
  private held: Held | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return DETAILS_PANE;
  }
  getDisplayText(): string {
    return word('details.pane-title');
  }
  override getIcon(): string {
    return 'panel-right-open';
  }

  override async onOpen(): Promise<void> {
    const bad = showPane('details', this.contentEl, (el) => {
      el.addClass('thoughtknot', 'thoughtknot-details-pane');
      this.empty();
    });
    if (bad) new Notice(bad);
    await Promise.resolve();
  }

  /** Shows `held` in the pane, in place of what it held; the card shown before is told its details were taken. */
  hold(held: Held): void {
    const was = this.held;
    this.held = held;
    if (was && was.el !== held.el) was.left('taken');
    this.contentEl.empty();
    this.contentEl.setAttribute('aria-label', held.title);
    this.contentEl.appendChild(held.el);
  }

  /** Lets `el` go, when it is the one held: the pane says how to fill it again. */
  release(el: HTMLElement): void {
    if (this.held?.el !== el) return;
    this.held = null;
    el.remove();
    this.contentEl.removeAttribute('aria-label');
    this.empty();
  }

  /** The pane holding nothing: a line saying how to fill it. */
  private empty(): void {
    if (this.held) return;
    this.contentEl.empty();
    this.contentEl.createEl('p', { cls: 'thoughtknot-details-pane-empty', text: word('details.pane-empty') });
  }

  override async onClose(): Promise<void> {
    const held = this.held;
    this.held = null;
    held?.left('closed');
    await Promise.resolve();
  }
}

/**
 * The side pane the display layer shows a card's details in, made of `plugin`'s details view. It opens in the right
 * sidebar the first time, and is revealed there after. A pane the person moved elsewhere is used where it is.
 */
export function detailsSidePane(plugin: Plugin): SidePane {
  const view = (): DetailsPaneView | null => {
    const v = plugin.app.workspace.getLeavesOfType(DETAILS_PANE)[0]?.view;
    return v instanceof DetailsPaneView ? v : null;
  };
  /** The details waiting for the pane to open the first time: they go in only if not let go meanwhile. */
  let waiting: HTMLElement | null = null;
  return {
    show: (el, title, left) => {
      const open = view();
      waiting = null;
      if (open) {
        open.hold({ el, title, left });
        void plugin.app.workspace.revealLeaf(open.leaf);
        return;
      }
      const ws = plugin.app.workspace,
        leaf = ws.getRightLeaf(false) ?? ws.getLeaf('split', 'vertical');
      waiting = el;
      void leaf.setViewState({ type: DETAILS_PANE, active: true }).then(() => {
        if (waiting !== el) return;
        waiting = null;
        view()?.hold({ el, title, left });
        void ws.revealLeaf(leaf);
      });
    },
    release: (el) => {
      if (waiting === el) waiting = null;
      view()?.release(el);
    },
  };
}
