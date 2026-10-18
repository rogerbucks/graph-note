// What the shared display layer asks of the host it is shown in (spec §10, Hosts; editor spec §26, cc_core_only). The layer
// draws a graph's card, its details and its forms with the DOM alone; the few things a host decides for itself, an icon
// set, whether the screen is a phone's, a notice, a menu, come through this one interface, installed once by the host
// before anything is drawn. Obsidian installs one made of its own `setIcon`, `Platform`, `Notice` and `Menu`; the browser
// editor's page installs one of its own. The layer imports no host, so nothing else tells it which it is in.

import { currentDirection, directionOf, setDirection, setLanguage, SOURCE_LANGUAGE } from '@thoughtknot/core';

/** A row of a menu the layer asks the host to show. */
export interface MenuRow {
  title: string;
  /** The name of the icon to show beside it. */
  icon: string;
  /** Shown ticked, as the one chosen. */
  checked?: boolean;
  /** Shown as a warning, as removing is. */
  warning?: boolean;
  onClick: () => void;
}

/** What a menu holds: its rows, and a line between groups. */
export type MenuEntry = MenuRow | 'separator';

/** The host's side of the display layer. */
export interface DisplayHost {
  /** Draws the icon named `name` into `el`, replacing what it held. */
  icon: (el: HTMLElement, name: string) => void;
  /** Whether the screen is a phone's, asked each time it matters, as it can change with the window. */
  isPhone: () => boolean;
  /** Tells the person something briefly, as a notice does. */
  notice: (message: string) => void;
  /** Shows a menu of `entries` with its top left at `at`, in the window of `doc`. */
  menu: (entries: MenuEntry[], at: { x: number; y: number }, doc: Document) => void;
  /**
   * Whether the host's content security policy forbids inline styles (`style-src` without `'unsafe-inline'`), as the
   * browser editor's page does (editor spec §26, cc_csp). The core writes the colours of a drawing as style attributes;
   * where they are forbidden the layer sets the same declarations through the CSSOM, which the policy allows, and no
   * style attribute is ever parsed from markup. Not set: styles stay attributes, as Obsidian has them.
   */
  noInlineStyle?: boolean;
  /**
   * The language the host shows itself in, as a language tag: Obsidian's own, the display language of VS Code, the
   * system's for the app and the browser page (editor spec §42, language_follows_host). The words are said in it when a
   * translation for it is added, else in UK English. Not set: UK English.
   */
  language?: () => string;
  /**
   * The direction the host reads in, when it sets one of its own (editor spec §42, rtl_mirrors). Not set: the direction
   * of its language, so an Arabic or Hebrew host mirrors the interface with no word from it.
   */
  direction?: () => 'ltr' | 'rtl';
}

/** What is said when the layer is used before any host was installed. */
export const NO_HOST = 'The display layer has no host: install one with installHost before drawing.';

let installed: DisplayHost | null = null;

/** Installs the host the layer draws in; the host that installs it last is the one used. */
export function installHost(host: DisplayHost): void {
  installed = host;
  const language = host.language?.() ?? SOURCE_LANGUAGE;
  setLanguage(language);
  setDirection(host.direction?.() ?? directionOf(language));
}

/**
 * `el` set to read in the host's direction, as the root of a view is: everything in it mirrors through the style sheets'
 * logical sides, and the drawing keeps the screen's (styles.css, .thoughtknot-svg).
 */
export function readInHostDirection<T extends HTMLElement>(el: T): T {
  el.dir = currentDirection();
  return el;
}

/** The installed host; throws `NO_HOST` when there is none, so a missing one is never a silent blank. */
export function displayHost(): DisplayHost {
  if (!installed) throw new Error(NO_HOST);
  return installed;
}

/** `value` unchanged, once a host is installed: a card's first step, so a page with no host is told so, not left a TypeError. */
export function inHost<T>(value: T): T {
  displayHost();
  return value;
}

/** Whether the host forbids inline styles, so a drawing's are set through the CSSOM; false with no host installed. */
export const noInlineStyle = (): boolean => installed?.noInlineStyle === true;

/** Draws the icon named `name` into `el`, through the host. */
export const setIcon = (el: HTMLElement, name: string): void => displayHost().icon(el, name);

/** Whether the screen is a phone's, through the host. */
export const isPhone = (): boolean => displayHost().isPhone();

/** Tells the person something briefly, through the host. */
export const notice = (message: string): void => displayHost().notice(message);
