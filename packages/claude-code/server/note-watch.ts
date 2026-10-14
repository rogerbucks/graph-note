// Watching an open note for changes on disk (spec §26, cc_redrawn_on_change). Its folder is watched, not the file, so a
// note another program replaces by a rename, as most editors and our own write do, is still followed; fs.watch's burst
// of events for one change is read once, `WATCH_DEBOUNCE_MS` after the last, well within the second the page has to
// draw it again. The store is handed the watcher, so a test fires it by hand and never waits on a clock.
import { watch } from 'node:fs';

/** Watches `file` in `folder`, calling `changed` after it changes; gives back what stops watching. */
export type Watcher = (folder: string, file: string, changed: () => void) => () => void;

/** How long after fs.watch's last event a change is read: short of a second, with room to read and draw it. */
export const WATCH_DEBOUNCE_MS = 100;

/** `fn`, called once `ms` after the last of a burst of calls. */
export function debounced(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

/** The watcher the store uses unless handed another: fs.watch on the note's folder, debounced. */
export const watchNote: Watcher = (folder, file, changed) => {
  const later = debounced(changed, WATCH_DEBOUNCE_MS);
  let watcher: ReturnType<typeof watch>;
  try {
    // a name that is not given (some systems give none) may be the note's
    watcher = watch(folder, { persistent: false }, (_event, name) => (name === null || name === file) && later());
  } catch {
    return () => {};
  }
  watcher.on('error', () => {});
  return () => watcher.close();
};
