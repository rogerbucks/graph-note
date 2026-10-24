// Runs before the browser editor's page in the app's window (spec §41, standalone_app). It answers the page's
// `/api/` calls from the picked folder (app-api.ts), so the page itself runs unchanged. It also adds a link back to
// the list of notes.
import { setLanguage, SOURCE_LANGUAGE, word } from '../../core/src/words.ts';
import { appFetch } from './app-api.ts';
import { tauriSaveNew, tauriStorage, type Invoke } from './tauri-files.ts';

const tauri = (globalThis as { __TAURI__?: { core: { invoke: Invoke } } }).__TAURI__;
if (tauri) {
  window.fetch = appFetch(
    { storage: tauriStorage(tauri.core.invoke), saveNew: tauriSaveNew(tauri.core.invoke) },
    window.fetch.bind(window),
  );
  // the link is made before the page runs, so it speaks the system's language itself, as app-start.ts does
  setLanguage(navigator.language || SOURCE_LANGUAGE);
  // in a nav of the page's prose, so the link takes the page's own link colour in both themes
  const nav = Object.assign(document.createElement('nav'), { className: 'gn-prose' });
  nav.append(Object.assign(document.createElement('a'), { href: 'index.html', textContent: word('app.back') }));
  document.querySelector('header')?.prepend(nav);
}
