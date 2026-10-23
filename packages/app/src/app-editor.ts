// Runs before the browser editor's page in the app's window (spec §41, standalone_app). It answers the page's
// `/api/` calls from the picked folder (app-api.ts), so the page itself runs unchanged. It also adds a link back to
// the list of notes. And it loads the page script again if the window failed to load it (page-retry.ts).
import { word } from '../../core/src/words.ts';
import { appFetch } from './app-api.ts';
import { tauriSaveNew, tauriStorage, type Invoke } from './tauri-files.ts';
import { retryPageScript } from './page-retry.ts';

const tauri = (globalThis as { __TAURI__?: { core: { invoke: Invoke } } }).__TAURI__;
if (tauri) {
  window.fetch = appFetch(
    { storage: tauriStorage(tauri.core.invoke), saveNew: tauriSaveNew(tauri.core.invoke) },
    window.fetch.bind(window),
  );
  // in a nav of the page's prose, so the link takes the page's own link colour in both themes
  const nav = Object.assign(document.createElement('nav'), { className: 'gn-prose' });
  nav.append(Object.assign(document.createElement('a'), { href: 'index.html', textContent: word('app.back') }));
  document.querySelector('header')?.prepend(nav);
}
// the page script runs after this one, so its failure to load is still to come
retryPageScript(document);
