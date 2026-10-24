// What the shared display layer asks of the host it is shown in (spec §10, Hosts; editor spec §26, cc_core_only). The layer
// draws a graph's card, its details and its forms with the DOM alone. A host decides a few things for itself: an icon
// set, whether the screen is a phone's, a notice, a menu. They come through this one interface. The host installs it
// once before anything is drawn. Obsidian installs one made of its own `setIcon`, `Platform`, `Notice` and `Menu`; the
// browser editor's page installs one of its own. The layer imports no host, so nothing else tells it which it is in.

import {
  currentDirection,
  directionOf,
  setDirection,
  setLanguage,
  setLocale,
  SOURCE_LANGUAGE,
} from '@thoughtknot/core';
import type { NoteStorage } from '@thoughtknot/core';
import type { LinkHost } from './link-host';

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

/**
 * A side pane of the host's own that a card's details can be shown in (editor spec §25, details_in_host_pane):
 * Obsidian's sidebar, a VS Code panel, a window of the app's own. One card's details are in it at a time.
 */
export interface SidePane {
  /**
   * Shows `el`, a card's details, in the pane under `title`, opening the pane if need be. When it is shown again, the
   * title changes. `left` is called when the details leave the pane without being asked: the person closed the pane
   * (`closed`), or another card's details took it (`taken`).
   */
  show: (el: HTMLElement, title: string, left: (why: 'closed' | 'taken') => void) => void;
  /** Takes `el` out of the pane, when it is the one shown there; the pane says it holds nothing. */
  release: (el: HTMLElement) => void;
}

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
  /** A side pane of the host's own for a card's details, where it has one (§25, details_in_host_pane). Not set: none. */
  sidePane?: SidePane;
  /**
   * Where the details' last place, size and state are kept between sessions, in the host's own data (§25,
   * sheet_layout_kept). `saved` gives what was kept, or nothing; `save` keeps a plain JSON value. Not set: the session only.
   */
  detailsLayout?: { saved: () => unknown; save: (layout: unknown) => void };
  /**
   * Whether the host's content security policy forbids inline styles (`style-src` without `'unsafe-inline'`), as the
   * browser editor's page does (editor spec §26, cc_csp). The core writes the colours of a drawing as style attributes.
   * Where they are forbidden the layer sets the same declarations through the CSSOM, which the policy allows. No style
   * attribute is ever parsed from markup. Not set: styles stay attributes, as Obsidian has them.
   */
  noInlineStyle?: boolean;
  /**
   * The language the host shows itself in, as a language tag: Obsidian's own, the display language of VS Code, the
   * system's for the app and the browser page (editor spec §42, language_follows_host). The words are said in it when a
   * translation for it is added, else in UK English. Numbers, days and lists are shown in its locale, and lists for the
   * reader sorted in its order (locale_formats, locale_sorting). Not set: UK English.
   */
  language?: () => string;
  /**
   * The direction the host reads in, when it sets one of its own (editor spec §42, rtl_mirrors). Not set: the direction
   * of its language, so an Arabic or Hebrew host mirrors the interface with no word from it.
   */
  direction?: () => 'ltr' | 'rtl';
}

/** A host's settings: one value, kept where the host keeps its own, and read back as it was saved. */
export interface SettingsStore {
  /** The settings last saved, or undefined when none were. */
  load: () => Promise<unknown>;
  /** Saves `value`, a plain JSON value, in place of what was saved before. */
  save: (value: unknown) => Promise<void>;
}

/**
 * A host's secrets, such as an AI provider's key, each read by its name: Obsidian's secret storage, VS Code's, the
 * system keychain in the standalone app; the settings keep only a secret's name, never the secret itself.
 */
export interface SecretStore {
  /** The secret named `name`, or null when the host holds none by that name. */
  get: (name: string) => string | null | Promise<string | null>;
}

/**
 * Everything a host gives the core (editor spec §41, host_contract_published). That is its display, its links, its
 * settings, its secrets and its notes. A new host is built from this alone, with no change to the core.
 */
export interface Host {
  display: DisplayHost;
  /** What the card of graph `graph`, in the note at `path`, is given to show and follow its links. */
  links: (path: string, graph: string) => LinkHost;
  settings: SettingsStore;
  secrets: SecretStore;
  /** Where the host's notes are read and written. */
  files: NoteStorage;
}

/** What is said when the layer is used before any host was installed. */
export const NO_HOST = 'The display layer has no host: install one with installHost before drawing.';

let installed: DisplayHost | null = null;

/** Installs the host the layer draws in; the host that installs it last is the one used. */
export function installHost(host: DisplayHost): void {
  installed = host;
  const language = host.language?.() ?? SOURCE_LANGUAGE;
  setLanguage(language);
  // a bare "en", as Obsidian says English, is the source's UK English, not American
  setLocale(language === 'en' ? SOURCE_LANGUAGE : language);
  setDirection(host.direction?.() ?? directionOf(language));
}

/**
 * `el` set to read in the host's direction, as the root of a view is. Everything in it mirrors through the style
 * sheets' logical sides. The drawing keeps the screen's (styles.css, .thoughtknot-svg).
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

/** The host's side pane for a card's details, or null where it has none, or no host is installed. */
export const sidePane = (): SidePane | null => installed?.sidePane ?? null;

/** Where the host keeps the details' layout between sessions, or null where it keeps none. */
export const keptLayout = (): DisplayHost['detailsLayout'] | null => installed?.detailsLayout ?? null;

/** Tells the person something briefly, through the host. */
export const notice = (message: string): void => displayHost().notice(message);
