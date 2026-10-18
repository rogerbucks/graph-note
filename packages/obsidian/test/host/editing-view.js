// A note open in the editing view, in Live Preview, with the plugin's own editor extension. The tests of the editor in
// place's cards need it. It has a real CodeMirror state that moves on as it is changed, and the cards it would draw.
import { cmState, cmView, editorLivePreviewField, editorInfoField } from './fake-obsidian.js';

/** The plugin's own view plugins, among the editor extensions it registered, however deep they are nested. */
function viewPlugins(env) {
  const found = [];
  const walk = (e) => {
    if (Array.isArray(e)) e.forEach(walk);
    else if (e instanceof cmView.ViewPlugin) found.push(e);
  };
  walk(env.state.editorExtensions ?? []);
  return found;
}

/**
 * Opens `text` as the note at `path` in the editing view. The plugin sees the editor through its own view plugins, as
 * Obsidian's editor makes them, and writes through it. `view.close()` closes the note as Obsidian closes an editor. Its
 * view plugins are destroyed, and the cards drawn at the time are left to the test.
 */
export function openNote(env, text, path) {
  const view = {
    state: cmState.EditorState.create({
      doc: text,
      extensions: [
        editorLivePreviewField.init(() => true),
        editorInfoField.init(() => ({ file: { path } })),
        ...(env.state.editorExtensions ?? []).filter((e) => !e?.listener),
      ],
    }),
    // each change kept with the text it was made to, so a test can see it and take it back as one undo would
    transactions: [],
    dispatch(spec) {
      const tr = view.state.update(spec);
      view.transactions.push({ tr, before: view.state.doc });
      view.state = tr.state;
    },
  };
  const made = viewPlugins(env).map((p) => p.create(view));
  view.close = () => made.forEach((m) => m.destroy?.());
  return view;
}

/** The cards the editor would draw for the note as it now is, each with the line its block's fence opens on. */
export function cardsOf(state) {
  const out = [];
  for (const source of state.facet(cmView.EditorView.decorations))
    source.between?.(0, state.doc.length, (from, _to, deco) => {
      if (deco.spec.widget) out.push({ line: state.doc.lineAt(from).number - 1, widget: deco.spec.widget });
    });
  return out;
}

/** Puts a card on the page, in the editing view, and waits for its drawing. */
export async function place(env, widget, until) {
  const host = env.doc.body.createDiv({ cls: 'markdown-source-view' });
  const dom = widget.toDOM();
  host.appendChild(dom);
  await until(() => !!dom.querySelector('.thoughtknot-view'));
  return dom;
}
