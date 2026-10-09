// A stand-in for Obsidian's Live Preview, on a real CodeMirror 6 (the versions Obsidian ships): the note as an editor,
// each gql block drawn by the plugin's processor in a block widget that is built again whenever the block's text
// changes, as Obsidian's own does, and a write to the note applied as one change, as Obsidian applies a file changed
// under an open editor (app.js, MarkdownView: onModify → setViewData → the editor's set: a line diff, one dispatch with
// userEvent "set"). For seeing in a browser what the editing view does to a card, and to the page, on each write.
import { EditorState, StateField, Prec } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { processors, files, editorExtensions, editorInfoField, editorLivePreviewField } from 'obsidian';

const PATH = 'Sample.md';

/** Where each gql block is in a document: the lines of its fences, and its text. */
function fences(doc) {
  const out = [];
  for (let n = 1; n <= doc.lines; n++) {
    if (!/^```gql\s*$/.test(doc.line(n).text)) continue;
    let end = n + 1;
    while (end <= doc.lines && !/^```\s*$/.test(doc.line(end).text)) end++;
    if (end > doc.lines) break;
    const body = [];
    for (let k = n + 1; k < end; k++) body.push(doc.line(k).text);
    out.push({ from: doc.line(n).from, to: doc.line(end).to, open: n - 1, source: body.join('\n') });
    n = end;
  }
  return out;
}

/** Obsidian's code-block widget, as it behaves: equal only to one of the same text, so any change builds it again. */
class ProcessorWidget extends WidgetType {
  constructor(block, note) {
    super();
    this.block = block;
    this.note = note;
  }
  eq(other) {
    return other.block.source === this.block.source;
  }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-embed-block markdown-rendered';
    const el = wrap.createDiv({ cls: 'block-language-gql' });
    const { block, note } = this;
    void processors.get('gql')(block.source, el, {
      sourcePath: PATH,
      getSectionInfo: () => ({ text: note, lineStart: block.open, lineEnd: block.open }),
      addChild: (c) => c.load(),
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

const obsidianBlocks = StateField.define({
  create: (state) => decorate(state),
  update: (deco, tr) => (tr.docChanged ? decorate(tr.state) : deco),
  provide: (f) => EditorView.decorations.from(f),
});

function decorate(state) {
  const note = state.doc.toString();
  return Decoration.set(
    fences(state.doc).map((b) =>
      Decoration.replace({ widget: new ProcessorWidget(b, note), block: true }).range(b.from, b.to),
    ),
  );
}

/** Builds the editor in `parent`; returns it. With `own`, the plugin's own editor extensions take precedence. */
export function livePreview(parent, own) {
  const host = parent.createDiv({ cls: 'markdown-source-view mod-cm6 is-live-preview' });
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: files.get(PATH),
      extensions: [
        editorLivePreviewField.init(() => true),
        editorInfoField.init(() => ({ file: { path: PATH } })),
        obsidianBlocks,
        ...(own ? editorExtensions.map((e) => Prec.highest(e)) : []),
        EditorView.lineWrapping,
      ],
    }),
  });
  view.dom.style.height = '80vh'; // an editor that scrolls itself, as Obsidian's does
  // a file changed under the open editor: one change for the lines that differ, as Obsidian applies it
  const apply = () => {
    const next = files.get(PATH),
      doc = view.state.doc,
      now = doc.toString();
    if (next === now) return;
    let a = 0;
    while (a < now.length && a < next.length && now[a] === next[a]) a++;
    let b = 0;
    while (b < now.length - a && b < next.length - a && now[now.length - 1 - b] === next[next.length - 1 - b]) b++;
    view.dispatch({
      changes: { from: a, to: now.length - b, insert: next.slice(a, next.length - b) },
      userEvent: 'set',
    });
  };
  return { view, apply };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * "The page stays still" (spec §4, decided 9 Oct 2026): with the second card edited in place and the editor scrolled so
 * the card's top is above the view, a comma typed at the end of its text is written and redrawn; the editor's scroll,
 * the box's place on screen and its focus must all be as they were. Returns what was seen.
 */
export async function pageStaysStill() {
  await pause(800);
  const sc = document.querySelector('.cm-editor .cm-scroller');
  const cards = [...document.querySelectorAll('.cm-editor .graph-note-view')];
  [...cards[1].querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Edit here').click();
  await pause(600);
  const t = document.querySelector('.cm-editor textarea.graph-note-text');
  t.focus();
  t.setSelectionRange(t.value.length, t.value.length);
  const card = t.closest('.cm-embed-block, .graph-note-block');
  sc.scrollTop += card.getBoundingClientRect().top - sc.getBoundingClientRect().top + 120;
  await pause(300);
  const before = { scrollTop: Math.round(sc.scrollTop), boxTop: Math.round(t.getBoundingClientRect().top) };
  t.value += ',';
  t.setSelectionRange(t.value.length, t.value.length);
  t.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ',' }));
  await pause(2500);
  const box = document.querySelector('.cm-editor textarea.graph-note-text');
  const after = {
    scrollTop: Math.round(sc.scrollTop),
    boxTop: box?.isConnected ? Math.round(box.getBoundingClientRect().top) : null,
    focused: document.activeElement === box,
    written: !!box && box.value.endsWith(','),
  };
  const still =
    Math.abs(after.scrollTop - before.scrollTop) <= 1 &&
    after.boxTop !== null &&
    Math.abs(after.boxTop - before.boxTop) <= 1;
  return { still: still && after.focused && after.written, before, after };
}
