// What the shared display layer asks of the host it is shown in (spec §10, Hosts; editor spec §26, cc_core_only). The layer
// draws a graph's card, its details and its forms with the DOM alone; the few things a host decides for itself, an icon
// set, whether the screen is a phone's, a notice, a menu, come through this one interface, installed once by the host
// before anything is drawn. Obsidian installs one made of its own `setIcon`, `Platform`, `Notice` and `Menu`; the browser
// editor's page installs one of its own. The layer imports no host, so nothing else tells it which it is in.

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
}

/** What is said when the layer is used before any host was installed. */
export const NO_HOST = 'The display layer has no host: install one with installHost before drawing.';

let installed: DisplayHost | null = null;

/** Installs the host the layer draws in; the host that installs it last is the one used. */
export function installHost(host: DisplayHost): void {
  installed = host;
}

/** The installed host; throws `NO_HOST` when there is none, so a missing one is never a silent blank. */
export function displayHost(): DisplayHost {
  if (!installed) throw new Error(NO_HOST);
  return installed;
}

/** Draws the icon named `name` into `el`, through the host. */
export const setIcon = (el: HTMLElement, name: string): void => displayHost().icon(el, name);

/** Whether the screen is a phone's, through the host. */
export const isPhone = (): boolean => displayHost().isPhone();

/** Tells the person something briefly, through the host. */
export const notice = (message: string): void => displayHost().notice(message);
