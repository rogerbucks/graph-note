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
const params = new URLSearchParams(location.search);
const live = params.has('live');
// ?twice draws a changed block twice, some 20 ms apart, as Obsidian's reading view does
const twice = new URLSearchParams(location.search).has('twice');
// ?reattach takes a redrawn card off the page and puts it back as it was, as reading view does
const reattach = new URLSearchParams(location.search).has('reattach');

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

// ?cm shows the note as Live Preview does, on a real CodeMirror; ?cm&own lets the plugin's own editor extension draw
if (params.has('cm')) {
  const { livePreview } = await import('./live-preview.js');
  const { apply } = livePreview(out, params.has('own'));
  plugin.app.vault.on('modify', apply);
  await plugin.openEditor({ path: 'Sample.md', line: 14, graph: 'reader' });
  document.body.dataset.ready = 'yes';
  if (params.has('check')) {
    const { pageStaysStill } = await import('./live-preview.js');
    // ?check=<card>:<pixels above the view, or end>
    const [card, at] = (params.get('check') || '1:120').split(':');
    const result = await pageStaysStill(Number(card), at === 'end' ? 'end' : Number(at));
    document.body.dataset.result = JSON.stringify(result);
  }
} else {
  await readingView();
}

async function readingView() {
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

  /** Draws block i again, the old card leaving the page first: on the page, as reading view; off it, as Live Preview. */
  function redraw(was, block, text) {
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
  }

  plugin.app.vault.on('modify', () => {
    const text = files.get('Sample.md'),
      now = blocksOf(text);
    now.forEach((block, i) => {
      const was = shown[i];
      if (!was || was.source === block.source) return;
      redraw(was, block, text);
      // as Obsidian's reading view does after a write (seen on Roger's Mac, 9 Oct 2026): the block drawn a second time,
      // some 20 ms after the first
      if (twice) setTimeout(() => redraw(was, block, text), 20);
      // as reading view also does (seen on Roger's Mac, 9 Oct 2026): the new card taken off the page and put back as it
      // was, some 20 ms after it is drawn, with no drawing in between
      if (reattach)
        setTimeout(() => {
          const mark = document.createComment('again');
          was.el.replaceWith(mark);
          setTimeout(() => mark.replaceWith(was.el), 8);
        }, 60);
    });
  });

  await plugin.openEditor({ path: 'Sample.md', line: 14, graph: 'reader' });
  document.body.dataset.ready = 'yes';
}
