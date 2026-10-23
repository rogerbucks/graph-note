// The app's first page (spec §41, standalone_app): pick a folder of notes, then open one. A note opens in the browser
// editor's page (editor.html), the same page the Claude Code host serves, with its calls answered in the window.
// The folder is kept by the app for as long as it runs, so going back lists it again without asking. The page speaks
// the system's language, as the editor's page speaks the browser's (language_follows_host).
import { setLocale } from '../../core/src/locale-formats.ts';
import { directionOf, setDirection, setLanguage, SOURCE_LANGUAGE, word } from '../../core/src/words.ts';
import { tauriStorage, type Invoke } from './tauri-files.ts';

/** The address of the editor for a note: its path in the fragment, as the server's address carries it. */
export const editorAddress = (path: string): string => `editor.html#token=app&note=${encodeURIComponent(path)}`;

/** The project's privacy page (risk LEGAL-2), shown on the first page as an address to type or copy. */
export const PRIVACY_PAGE = 'https://thoughtknot.app/privacy.html';

/** Fills `main` with the folder's notes, each a link to the editor; or the button to pick a folder. */
export async function startApp(doc: Document, invoke: Invoke): Promise<void> {
  // as installHost sets a host's language (core display/host.ts), without the rest of the core it would bring
  const language = doc.defaultView?.navigator.language || SOURCE_LANGUAGE;
  const root = doc.documentElement;
  root.lang = setLanguage(language);
  setLocale(language);
  setDirection(directionOf(language));
  root.dir = directionOf(language);
  const privacy = doc.body.appendChild(Object.assign(doc.createElement('footer'), { className: 'gn-app-privacy' }));
  privacy.textContent = word('app.privacy', { address: PRIVACY_PAGE });
  const main = doc.getElementById('gn-app') as HTMLElement;
  const say = (text: string, tag = 'p') =>
    main.appendChild(Object.assign(doc.createElement(tag), { textContent: text }));
  const show = async (folder: string | null) => {
    main.replaceChildren();
    let notes: string[] | null = null;
    try {
      notes = await tauriStorage(invoke).list();
    } catch {
      // no folder picked yet
    }
    const pick = Object.assign(doc.createElement('button'), { type: 'button', textContent: word('app.open-folder') });
    pick.addEventListener('click', () => {
      void (async () => {
        try {
          const name = (await invoke('pick_folder')) as string | null;
          if (name !== null) await show(name);
        } catch (e) {
          say(word('app.cannot-read', { why: e instanceof Error ? e.message : String(e) }));
        }
      })();
    });
    if (notes === null) {
      say(word('app.no-folder'));
      main.appendChild(pick);
      return;
    }
    say(
      folder ? word('app.folder-notes', { folder, count: notes.length }) : word('app.notes', { count: notes.length }),
      'h2',
    );
    if (!notes.length) say(word('app.no-notes'));
    const list = main.appendChild(doc.createElement('ul'));
    for (const path of notes) {
      const link = Object.assign(doc.createElement('a'), { href: editorAddress(path), textContent: path });
      list.appendChild(doc.createElement('li')).appendChild(link);
    }
    main.appendChild(pick);
  };
  await show(null);
}

const tauri = (globalThis as { __TAURI__?: { core: { invoke: Invoke } } }).__TAURI__;
if (tauri && typeof document !== 'undefined') void startApp(document, tauri.core.invoke);
