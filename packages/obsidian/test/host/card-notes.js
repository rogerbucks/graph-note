// The note the tests of editing in place draw and edit (editor spec §4, "In place"), and how Obsidian draws its block:
// on the page, or, as Live Preview does, into a card that goes on the page only once the drawing is done.
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
