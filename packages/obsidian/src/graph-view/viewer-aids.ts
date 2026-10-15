// The viewer's aids as the settings say (editor spec §24), and the card's use of them: when the mini-map shows
// (mini_map_setting), whether the details panel stays open (details_always_visible) and where it goes (details_narrow),
// and the quick-info tooltip. A card is given the settings with its other options, the same in a note, the pane and full
// screen; `Aids` holds the parts a card builds from them.
import type { Component } from 'obsidian';
import type { Drawn, MiniMapSetting, Settings, View, Zoom } from '@graph-note/core';
import type { DetailsPanel } from './details-panel';
import { MiniMap } from './mini-map';
import { QuickInfo } from './quick-info';
import type { Taps } from './taps';
import type { ViewOptions } from './view-options';

/** What a drawing's aids are set to. */
export interface ViewerAids {
  miniMap: MiniMapSetting;
  /** Whether the details panel stays open, showing the graph's summary while nothing is chosen. */
  detailsOpen: boolean;
}

/** The aids the settings give. */
export const aidsOf = (s: Settings): ViewerAids => ({ miniMap: s.miniMap, detailsOpen: s.detailsOpen === 'on' });

/** How wide a card must be, in pixels, for the details to sit beside the drawing; narrower, they go below it (§24). */
const BESIDE_MIN = 560;

/** What the aids ask of their card, most of it given late because the card builds it after them. */
export interface AidsHost {
  o: ViewOptions;
  /** The card's own element. */
  root: HTMLElement;
  viewport: HTMLElement;
  svg: () => SVGSVGElement | null;
  zoom: () => Zoom;
  /** The viewport's size as the zoom has it: none while the card is hidden. */
  size: () => { width: number; height: number };
  drawn: () => Drawn;
  taps: Taps;
  byKeyboard: () => boolean;
}

/** The aids of one card: its mini-map, its tooltip, and where its kept-open details sit. */
export class Aids {
  readonly info: QuickInfo;
  private readonly miniMap: MiniMap | null;
  private readonly host: AidsHost;

  /** For the card (which owns their listeners) and what they ask of it. */
  constructor(card: Component, host: AidsHost) {
    this.host = host;
    this.info = new QuickInfo({
      o: host.o,
      svg: host.svg,
      viewport: () => host.viewport,
      view: () => host.zoom().view(),
      taps: host.taps,
      byKeyboard: host.byKeyboard,
    });
    // a small copy of the whole drawing, shown by its setting; a graph drawn as a table has none (§24, mini_map)
    this.miniMap = host.svg()
      ? new MiniMap(host.viewport, card, {
          setting: () => host.o.aids?.miniMap ?? 'off',
          zoom: host.zoom,
          size: host.size,
        })
      : null;
    this.miniMap?.redrawn(host.drawn());
  }

  /** The drawing was laid out again: the mini-map is a copy of the layout as it is now. */
  redrawn(drawn: Drawn): void {
    this.miniMap?.redrawn(drawn);
  }

  /** The view changed: the mini-map outlines the part in view, and a tooltip, beside a thing as it was, closes. */
  viewChanged(v: View): void {
    this.miniMap?.update(v);
    this.info.hide();
  }

  /** Kept open, the details are in the card from the start, with the graph's summary until a thing is chosen (§24). */
  openDetails(details: DetailsPanel): void {
    if (!this.host.o.aids?.detailsOpen) return;
    this.host.root.addClass('is-details-open');
    this.placeDetails();
    details.summary();
  }

  /** Beside the drawing, or below it once the card is narrower than the two side by side need (§24, details_narrow). */
  placeDetails(): void {
    const width = this.host.root.clientWidth;
    // a card with no width yet, not on the page, is left as it was
    if (this.host.o.aids?.detailsOpen && width) this.host.root.toggleClass('is-details-below', width < BESIDE_MIN);
  }

  /** The card is going: its tooltip goes with it. */
  unload(): void {
    this.info.onunload();
  }
}
