// The View menu (editor spec §25, view_switches): a graph's four switches — labels by zoom, busy hubs folded, groups
// folded and parallel links merged — each a switch on or off, under the bar's View button, starting as the plugin's
// settings hold them (view_switch_defaults). Turning one redraws the graph at once: labels by zoom in place, the others
// by laying the graph out again, which the card puts in place keeping the selection and the focus; a busy hub's stub, a
// folded group's box and a hub's details open and fold them the same way. Nothing here reaches the note, so the menu is
// offered and works in reading view too (view_switch_view_only); it says in words when the graph could not be redrawn.
import { SWITCH_NAMES, VIEW_SWITCHES, edgesOf, foldsHiding, labelsHidden, word } from '@graph-note/core';
import type { Drawn, GraphDrawing, ViewState, ViewSwitch } from '@graph-note/core';
import type { SwitchesShown } from './view-options';

/** A card's View menu, hidden until the bar's button opens it. */
export interface ViewMenu {
  el: HTMLElement;
  /** Opens or closes it, as the bar's button `b` does, and says which on the button. */
  toggle: (b: HTMLElement) => void;
  /** Draws each switch as the state now stands. */
  refresh: () => void;
  /** Says how the last turn went, such as why the drawing could not be redrawn; empty, nothing. */
  say: (words: string) => void;
}

/** Builds the menu at the end of what `root` holds so far: a switch for each of the four, which `turned` acts on. */
export function renderViewMenu(
  root: HTMLElement,
  state: ViewState,
  turned: (s: ViewSwitch, on: boolean) => void,
): ViewMenu {
  const el = root.createDiv({ cls: 'graph-note-view-menu', attr: { role: 'group', 'aria-label': word('bar.view') } });
  el.hidden = true;
  const switches: { s: ViewSwitch; b: HTMLButtonElement; says: HTMLElement }[] = [];
  for (const s of VIEW_SWITCHES) {
    const b = el.createEl('button', { cls: 'graph-note-switch', attr: { type: 'button', role: 'switch' } });
    b.createSpan({ text: SWITCH_NAMES[s] });
    const says = b.createSpan({ cls: 'graph-note-switch-state' });
    b.addEventListener('click', () => turned(s, !state.switches[s]));
    switches.push({ s, b, says });
  }
  const status = el.createDiv({ cls: 'graph-note-quiet', attr: { role: 'status' } });
  const refresh = () => {
    for (const { s, b, says } of switches) {
      b.setAttribute('aria-checked', String(state.switches[s]));
      says.setText(state.switches[s] ? ' — on' : ' — off');
    }
  };
  refresh();
  return {
    el,
    toggle: (b) => {
      el.hidden = !el.hidden;
      b.setAttribute('aria-expanded', String(!el.hidden));
    },
    refresh,
    say: (words) => status.setText(words),
  };
}

/** What turning a switch needs of its card. */
export interface SwitchingHost {
  /** The graph as drawn, unfolded: what its folds are found in. */
  drawing: () => GraphDrawing | undefined;
  /** Puts the graph laid out again in place of the drawing, keeping the selection and the focus. */
  relaid: (drawn: Drawn) => void;
  /** Shows the drawing again as it stands, as labels by zoom changes it in place. */
  shown: () => void;
}

/** One card's View menu and what its switches, stubs and boxes do to the drawing. */
export class ViewSwitching {
  readonly menu: ViewMenu;
  private readonly o: SwitchesShown;
  private readonly host: SwitchingHost;
  private readonly owner: object;
  /** The switches and the plan the drawing shows now, to tell whether another card changed them. */
  private drawnAs = '';

  /** Builds the menu in `root`, for the card `owner`, whose layouts replace one another. */
  constructor(root: HTMLElement, o: SwitchesShown, host: SwitchingHost, owner: object) {
    this.o = o;
    this.host = host;
    this.owner = owner;
    this.menu = renderViewMenu(root, o.state, (s, on) => this.turn(s, on));
    this.drawnAs = this.now();
  }

  private now(): string {
    return JSON.stringify([this.o.state.switches, this.o.state.plan]);
  }

  /** Whether the drawing's link labels are hidden at `scale` (untangle_labels). */
  labelsHidden(scale: number): boolean {
    return labelsHidden(this.o.state.switches, scale);
  }

  /** Turns a switch: labels by zoom at once in place, any other by laying the graph out again. */
  turn(s: ViewSwitch, on: boolean): void {
    const again = this.o.state.turn(s, on);
    this.menu.refresh();
    if (again) void this.redraw();
    else {
      this.drawnAs = this.now();
      this.host.shown();
    }
  }

  /**
   * Opens a busy hub's stub or a folded group's box, by its `data-fold` (`hub:` or `group:` and its name). Opened from the
   * keyboard, `focus` then takes the keyboard to the hub, or to the group's first thing, on the drawing laid out again.
   */
  unfold(fold: string, focus?: (key: string) => void): void {
    const at = fold.indexOf(':'),
      name = fold.slice(at + 1),
      hub = fold.startsWith('hub:');
    const to = hub ? name : this.o.state.plan?.groups.find(([label]) => label === name)?.[1][0];
    this.o.state.open(hub ? { hub: name } : { group: name });
    void this.redraw(focus && to !== undefined ? () => focus(to) : undefined);
  }

  /** A busy hub's links and whether they are folded now, for its details; null for another thing. */
  hub(key: string): { links: number; folded: boolean } | null {
    const d = this.host.drawing();
    return d ? this.o.state.hub(d, key) : null;
  }

  /** Folds a busy hub's links into their stub, or opens them, from its details. */
  toggleHub(key: string): void {
    if (this.hub(key)?.folded) this.o.state.open({ hub: key });
    else this.o.state.fold({ hub: key });
    void this.redraw();
  }

  /** Opens the folds a thing is hidden in, then runs `then` on the drawing laid out again; false when none hides it. */
  unfoldTo(key: string, then: () => void): boolean {
    const d = this.host.drawing();
    const hiding = d ? foldsHiding(this.o.state.plan, edgesOf(d), key) : { hubs: [] };
    if (!hiding.hubs.length && hiding.group === undefined) return false;
    for (const hub of hiding.hubs) this.o.state.open({ hub });
    if (hiding.group !== undefined) this.o.state.open({ group: hiding.group });
    void this.redraw(then);
    return true;
  }

  /** Brings the drawing up to date when another card, such as its full screen, turned the shared switches. */
  sync(): void {
    if (this.now() === this.drawnAs) return;
    this.menu.refresh();
    void this.redraw();
  }

  /** Lays the graph out again as the switches now fold it, and has the card put it in place; or says why not. */
  private async redraw(then?: () => void): Promise<void> {
    this.menu.say('Drawing again…');
    let next: Awaited<ReturnType<SwitchesShown['relayout']>>;
    try {
      next = await this.o.relayout(this.owner);
    } catch {
      this.menu.say('The drawing engine could not draw it so; it is shown as it was.');
      return;
    }
    if (!next) return; // a newer layout for this card was asked for
    if ('reason' in next) {
      this.menu.say('Drawn so, the graph is over a size or time limit, so it is shown as it was.');
      return;
    }
    this.drawnAs = this.now();
    this.menu.say('');
    this.host.relaid(next);
    then?.();
  }
}
