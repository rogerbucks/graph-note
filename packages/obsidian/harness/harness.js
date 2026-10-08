// Draws every gql block of the sample note with the real plugin bundle, as Obsidian's reading view would; and, as
// Obsidian does, draws a block again when its text in the note changes: the old card leaves the page first, and the new
// one is built after — on the page, as reading view does, or with ?live off it and put there once drawn, as Live Preview.
import Plugin from '../src/main.ts';
import { processors, files } from 'obsidian';
import note from './sample.md';

files.set('Sample.md', note);
const plugin = new Plugin();
await plugin.onload();
const out = document.getElementById('note');
// ?live draws a changed block as Live Preview does, off the page first; otherwise as reading view
const live = new URLSearchParams(location.search).has('live');

/** The gql blocks of a note's text, each with its fence line and its text. */
function blocksOf(text) {
  const lines = text.split('\n'),
    found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^```gql\s*$/.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
    found.push({ fence: i, end: j, source: lines.slice(i + 1, j).join('\n') });
    i = j;
  }
  return found;
}

/** Runs the plugin's processor on one block, into el; returns the children it added, to unload when it goes. */
async function draw(el, block, text) {
  const children = [];
  await processors.get('gql')(block.source, el, {
    sourcePath: 'Sample.md',
    getSectionInfo: () => ({ text, lineStart: block.fence, lineEnd: block.end }),
    addChild: (c) => {
      children.push(c);
      c.load();
    },
  });
  return children;
}

const lines = note.split('\n');
const shown = [];
let next = 0;
for (let i = 0; i < lines.length; i++) {
  const block = blocksOf(note)[next];
  if (block && i === block.fence) {
    const el = out.createDiv({ cls: 'block-language-gql' });
    shown.push({ el, source: block.source, children: await draw(el, block, note) });
    next++;
    i = block.end;
  } else if (lines[i].trim())
    out.createEl(lines[i].startsWith('#') ? 'h2' : 'p', { text: lines[i].replace(/^#+\s*/, '') });
}

plugin.app.vault.on('modify', () => {
  const text = files.get('Sample.md'),
    now = blocksOf(text);
  now.forEach((block, i) => {
    const was = shown[i];
    if (!was || was.source === block.source) return;
    const old = was.el;
    was.children.forEach((c) => c.unload());
    const el = document.createElement('div');
    el.className = 'block-language-gql';
    Object.assign(was, { el, source: block.source, children: [] });
    if (live) {
      // as Live Preview: the old card leaves, and the new one is drawn off the page and put there after
      const mark = document.createComment('block');
      old.replaceWith(mark);
      void draw(el, block, text).then((children) => {
        was.children = children;
        mark.replaceWith(el);
      });
    } else {
      old.replaceWith(el); // as reading view: the old card leaves the page before the new one is drawn
      void draw(el, block, text).then((children) => (was.children = children));
    }
  });
});

await plugin.openEditor({ path: 'Sample.md', line: 14, graph: 'reader' });
document.body.dataset.ready = 'yes';
