// Loads the editor's page script again when the app's window failed to load it (spec §41, standalone_app). On Linux,
// in CI, the window sometimes refuses `page.js` as `text/html`, though the app holds it as JavaScript (23 Oct 2026).
// It never happened on the same build run locally. A fresh address (`page.js?try=1`) is a new load, as the window keeps
// a failed module under its address. Tauri reads the file without the `?try=` part.
// - Each failure is kept in `data-page-failures` on the page's root element, so a test can say what went wrong.
// - After the last try, nothing more is done: the page keeps its "Loading the note…" line.

/** How many times the page script is loaded again after a failure. */
export const PAGE_TRIES = 2;

/** The page script's address in the editor's page (packages/claude-code/page/index.html). */
export const PAGE_SCRIPT = '/page.js';

/** Watches the page script in `doc`; loads it again under a fresh address each time it fails, up to `tries` times. */
export function retryPageScript(doc: Document, tries = PAGE_TRIES): void {
  const first = doc.querySelector<HTMLScriptElement>(`script[src="${PAGE_SCRIPT}"]`);
  if (!first) return;
  const watch = (script: HTMLScriptElement, done: number) =>
    script.addEventListener('error', () => {
      const root = doc.documentElement;
      root.dataset.pageFailures = String(done + 1);
      if (done >= tries) return;
      const again = doc.createElement('script');
      again.type = 'module';
      again.src = `${PAGE_SCRIPT}?try=${done + 1}`;
      watch(again, done + 1);
      doc.head.append(again);
    });
  watch(first, 0);
}
