// Spike: the browser view's page. The Obsidian plugin's own view, run against the harness's shim of Obsidian, on one
// note the server reads from the Mac: every gql block drawn as in reading view, and every change the view makes written
// back to the note through the server. The note is named by ?path=, the token by #token= (server.mjs).
import Plugin from '../../packages/obsidian/src/main.ts';
import { processors, files } from 'obsidian';

const path = new URLSearchParams(location.search).get('path') ?? '';
const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
const api = (method, body) =>
  fetch(`/api/note?path=${encodeURIComponent(path)}`, { method, body, headers: { 'x-token': token } });
const out = document.getElementById('note');

const got = await api('GET');
if (!got.ok) {
  out.createEl('p', { text: `Could not open ${path}: ${await got.text()}` });
  throw new Error('no note');
}
files.set(path, await got.text());
const plugin = new Plugin();
await plugin.onload();

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

const shown = [];
async function draw(el, block, text) {
  const children = [];
  await processors.get('gql')(block.source, el, {
    sourcePath: path,
    getSectionInfo: () => ({ text, lineStart: block.fence, lineEnd: block.end }),
    addChild: (c) => {
      children.push(c);
      c.load();
    },
  });
  return children;
}

/** The note as reading view shows it: headings and paragraphs as text, each gql block drawn by the plugin. */
async function render(text) {
  shown.forEach((s) => s.children.forEach((c) => c.unload()));
  shown.length = 0;
  out.empty();
  const lines = text.split('\n'),
    blocks = blocksOf(text);
  let next = 0;
  for (let i = 0; i < lines.length; i++) {
    const block = blocks[next];
    if (block && i === block.fence) {
      const el = out.createDiv({ cls: 'block-language-gql' });
      shown.push({ el, source: block.source, children: await draw(el, block, text) });
      next++;
      i = block.end;
    } else if (lines[i].trim())
      out.createEl(lines[i].startsWith('#') ? 'h2' : 'p', { text: lines[i].replace(/^#+\s*/, '') });
  }
}

// a change the view makes reaches the note on the Mac, and the note is drawn again from it, as Obsidian does
plugin.app.vault.on('modify', async () => {
  const text = files.get(path);
  const put = await api('PUT', text);
  if (!put.ok) document.body.dataset.saveError = await put.text();
  await render(text);
});

await render(files.get(path));
document.body.dataset.ready = 'yes';
