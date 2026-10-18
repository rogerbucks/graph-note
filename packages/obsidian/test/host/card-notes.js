// The note the tests of editing in place draw and edit (editor spec §4, "In place"). Also how Obsidian draws its block.
// It goes on the page, or, as Live Preview does, into a card that goes on the page only once the drawing is done.
import { fakeContext } from './fake-obsidian.js';
import { fence } from './notes.js';

/** Where the note is. */
export const PATH = 'Some note.md';
/** Its one graph block. */
export const READER = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(large)-[:ANSWERS]->(q)`;
/** The note. */
export const NOTE = ['# Reader', '', fence(READER), ''].join('\n');

/** Draws the note's graph block, as Obsidian does when the note is shown or its block's text changes. */
export async function show(env) {
  const note = env.state.files.get(PATH),
    lines = note.split('\n'),
    open = lines.findIndex((l) => l.startsWith('```gql'));
  let end = open + 1;
  while (!/^```\s*$/.test(lines[end])) end++;
  const el = env.doc.body.createDiv();
  await env.state.processors.get('gql')(lines.slice(open + 1, end).join('\n'), el, fakeContext(note, open));
  return el;
}

/**
 * Draws the block into a card that goes on the page only `ms` later. Live Preview does this for a card below the part
 * of the note in view, placing it only once it is scrolled to. Cards also wait while the layout engine starts. Returns
 * the card's holder at once, and the promise of its placing.
 */
export async function showLate(env, ms) {
  const note = env.state.files.get(PATH),
    lines = note.split('\n'),
    open = lines.findIndex((l) => l.startsWith('```gql'));
  let end = open + 1;
  while (!/^```\s*$/.test(lines[end])) end++;
  const el = env.doc.createElement('div');
  await env.state.processors.get('gql')(lines.slice(open + 1, end).join('\n'), el, fakeContext(note, open));
  const placed = new Promise((r) => setTimeout(r, ms)).then(() => env.doc.body.appendChild(el));
  return { el, placed };
}

/**
 * Draws the note's first graph block where Obsidian's reading view would put it (`view` 'reading'), or where the editing
 * view would ('live'). It goes on the page, or there only after it is drawn (`offPage`). `note` is the note's text, the
 * file by default. The card's components are pushed onto `children`, so a test can reach the card itself.
 */
export async function showIn(env, view, { offPage = false, note, children } = {}) {
  const text = note ?? env.state.files.get(PATH),
    lines = text.split('\n'),
    open = lines.findIndex((l) => l.startsWith('```gql'));
  let end = open + 1;
  while (!/^```\s*$/.test(lines[end])) end++;
  const host = env.doc.createElement('div');
  host.addClass(view === 'reading' ? 'markdown-reading-view' : 'markdown-source-view');
  const inner = host.createDiv({ cls: view === 'reading' ? 'markdown-preview-view markdown-rendered' : 'cm-editor' });
  const el = inner.createDiv({ cls: 'block-language-gql' });
  if (!offPage) env.doc.body.appendChild(host);
  await env.state.processors.get('gql')(lines.slice(open + 1, end).join('\n'), el, fakeContext(text, open, children));
  if (offPage) env.doc.body.appendChild(host);
  return el;
}

/** Draws the block as Live Preview does: into a card that goes on the page only once the drawing is done. */
export async function showOffPage(env) {
  const note = env.state.files.get(PATH),
    lines = note.split('\n'),
    open = lines.findIndex((l) => l.startsWith('```gql'));
  let end = open + 1;
  while (!/^```\s*$/.test(lines[end])) end++;
  const el = env.doc.createElement('div');
  await env.state.processors.get('gql')(lines.slice(open + 1, end).join('\n'), el, fakeContext(note, open));
  env.doc.body.appendChild(el);
  return el;
}
