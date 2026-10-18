// The note the edit pane's tests open (spec §4, §9) — two graph blocks with prose between — and the pane opened on it as
// the Edit button opens it, with typing into its field as a person types.
import { readFileSync } from 'node:fs';
import { load, root } from './load-plugin.js';
import { fence } from './notes.js';

/** The plugin's styles. */
export const styles = readFileSync(`${root}styles.css`, 'utf8');
/** The note's first graph block. */
export const READER = `// graph: reader
(question:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large)`;
/** Its second. */
export const OTHER = "// graph: other\n(x:Thing {name: 'X'})";
/** The note. */
export const NOTE = ['# Reader', '', fence(READER), '', 'Between.', '', fence(OTHER), ''].join('\n');
/** Where the note is. */
export const PATH = 'Reader.md';

/** Opens the pane on a block, as the Edit button does; returns it with the plugin's world. */
export async function open(options = {}, line = 2) {
  const env = await load({ files: { [PATH]: options.note ?? NOTE }, ...options });
  await env.plugin.openEditor({ path: PATH, line, graph: 'reader' });
  const leaf = env.app.workspace.getLeavesOfType('thoughtknot-pane')[0];
  return { ...env, leaf, pane: leaf?.view, el: leaf?.view.contentEl };
}
/** The pane's text field. */
export const textarea = (el) => el.querySelector('textarea');
/** Types into the field: its text becomes `value`, with the caret at `caret`. */
export const type = (el, value, caret = value.length) => {
  const t = textarea(el);
  t.value = value;
  t.setSelectionRange(caret, caret);
  t.dispatch('input');
};
/** The note as it now is. */
export const note = (env) => env.state.files.get(PATH);
