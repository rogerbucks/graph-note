// The home page's live demo (spec §41, site_demo). It draws the project's own graph notes with the real plugin bundle,
// on this harness's Obsidian stand-in, with real icons (demo-shim.js). Each graph is a card, as in a note's
// reading view, and the first opens in the edit pane beside them. Every edit stays in this page: the stand-in sends no
// request and the page keeps nothing, so a reload starts afresh. scripts/site-demo.mjs builds it with the note.
import Plugin from '../src/main.ts';
import { processors, files } from 'obsidian';
import note from 'demo-note';

const PATH = 'ThoughtKnot.md';

/** The gql blocks of a note's text, each with its fence line, its end line and its text. */
export function blocksOf(text) {
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
    sourcePath: PATH,
    getSectionInfo: () => ({ text, lineStart: block.fence, lineEnd: block.end }),
    addChild: (c) => {
      children.push(c);
      c.load();
    },
  });
  return children;
}

/** Draws the note in `out` as reading view does, and draws a block again when an edit changes its text. */
async function start(out) {
  files.set(PATH, note);
  const plugin = new Plugin();
  await plugin.onload();
  out.replaceChildren();
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
    const text = files.get(PATH);
    blocksOf(text).forEach((block, i) => {
      const was = shown[i];
      if (!was || was.source === block.source) return;
      was.children.forEach((c) => c.unload());
      const el = document.createElement('div');
      el.className = 'block-language-gql';
      was.el.replaceWith(el);
      Object.assign(was, { el, source: block.source, children: [] });
      void draw(el, block, text).then((children) => (was.children = children));
    });
  });
  const first = blocksOf(note)[0];
  const graph = /\/\/ graph: (\w+)/.exec(first.source)[1];
  await plugin.openEditor({ path: PATH, line: first.fence, graph });
  document.body.dataset.ready = 'yes';
}

// the drawing follows the reader's light or dark scheme, as Obsidian's does
const dark = matchMedia('(prefers-color-scheme: dark)');
const scheme = () => document.documentElement.classList.toggle('dark', dark.matches);
scheme();
dark.addEventListener('change', scheme);
const out = document.getElementById('note');
start(out).catch((e) => {
  out.replaceChildren(Object.assign(document.createElement('p'), { textContent: String(e?.message ?? e) }));
});
