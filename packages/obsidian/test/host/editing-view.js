// A note open in the editing view, in Live Preview, with the plugin's own editor extension, as the tests of the editor in
// place's cards need it: a real CodeMirror state that moves on as it is changed, and the cards it would draw.
import { cmState, cmView, editorLivePreviewField, editorInfoField } from './fake-obsidian.js';

/** Opens `text` as the note at `path` in the editing view; the plugin sees the editor, and writes through it. */
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
    dispatch(spec) {
      view.state = view.state.update(spec).state;
    },
  };
  env.plugin.editorViews.add(view);
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
  await until(() => !!dom.querySelector('.graph-note-view'));
  return dom;
}
