// What a drawn card is owned by (spec §4; editor spec §26, cc_core_only): a lifecycle with no host in it, so the same card
// loads and unloads in Obsidian and in the browser editor's page. It does what a component of Obsidian does and no more:
// `load` runs `onload` and loads the children; `unload` unloads the children, runs what was registered, then `onunload`;
// a listener registered through `registerDomEvent` is taken off the element when the card unloads, so nothing a card
// listened to outlives it. A host that needs its own kind of component wraps one of these (the Obsidian plugin's
// `adopt`), so the card never imports the host's.

/** A child that can be given to a lifecycle: anything with a load and an unload. */
export interface Child {
  load(): void;
  unload(): void;
}

/** One card's, or one part of a card's, life. */
export class Lifecycle implements Child {
  private loaded = false;
  private children: Child[] = [];
  private cleanups: (() => void)[] = [];

  /** Runs once, when the lifecycle loads. */
  onload(): void {}

  /** Runs once, when it unloads, after the children and what was registered. */
  onunload(): void {}

  /** Starts it: `onload`, then its children. A lifecycle already loaded is left as it is. */
  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.onload();
    for (const c of [...this.children]) c.load();
  }

  /** Ends it: the children, what was registered, then `onunload`. One not loaded is left as it is. */
  unload(): void {
    if (!this.loaded) return;
    for (const c of this.children.splice(0)) c.unload();
    for (const f of this.cleanups.splice(0)) f();
    this.loaded = false;
    this.onunload();
  }

  /** Gives it a child, loaded at once when this is loaded already. */
  addChild<T extends Child>(child: T): T {
    this.children.push(child);
    if (this.loaded) child.load();
    return child;
  }

  /** Takes a child away and unloads it. */
  removeChild<T extends Child>(child: T): T {
    this.children = this.children.filter((c) => c !== child);
    child.unload();
    return child;
  }

  /** Runs `cleanup` when this unloads. */
  register(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  /** Listens on `target`, and stops listening when this unloads. */
  registerDomEvent(
    target: EventTarget,
    type: string,
    listener: (e: never) => void,
    options?: AddEventListenerOptions | boolean,
  ): void {
    const fn = listener as unknown as EventListener;
    target.addEventListener(type, fn, options);
    this.register(() => target.removeEventListener(type, fn, options));
  }
}
