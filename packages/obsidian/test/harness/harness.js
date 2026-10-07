// Draws every gql block of the sample note with the real plugin bundle, as Obsidian's reading view would.
import Plugin from '../../src/main.ts';
import { processors } from 'obsidian';
import note from './sample.md';

const plugin = new Plugin();
await plugin.onload();
const lines = note.split('\n'), out = document.getElementById('note');
for (let i = 0; i < lines.length; i++) {
  if (!/^```gql\s*$/.test(lines[i])) { if (lines[i].trim()) out.createEl(lines[i].startsWith('#') ? 'h2' : 'p', { text: lines[i].replace(/^#+\s*/, '') }); continue; }
  let j = i + 1; while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
  const el = out.createDiv({ cls: 'block-language-gql' });
  const fence = i;
  await processors.get('gql')(lines.slice(i + 1, j).join('\n'), el, {
    sourcePath: 'Sample.md', getSectionInfo: () => ({ text: note, lineStart: fence, lineEnd: j }), addChild: (c) => c.load(),
  });
  i = j;
}
document.body.dataset.ready = 'yes';
