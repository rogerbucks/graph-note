// The block editor's help with problems (spec §4, §8): the list of every problem with its line, the problems on the
// caret's line with their fixes as buttons, a fix's edits applied to the text, and new problems said to screen readers.
import type { Diagnostic } from '@graph-note/core';
import { button } from './editor-layout';

/** LSP DiagnosticSeverity: 1 is an error, 4 a hint. */
const HINT = 4;
const classOf = (d: Diagnostic) => (d.severity === 1 ? 'is-error' : d.severity === HINT ? 'is-hint' : 'is-warning');

/** The edits of a fix, by document, as a problem's fix gives them. */
export type FixChanges = Record<string, { range: Diagnostic['range']; newText: string }[]>;

/** Lists every problem with its line and its fix, or says there are none. */
export function listProblems(list: HTMLElement, problems: Diagnostic[]): void {
  list.empty();
  if (!problems.length) {
    list.createEl('p', { cls: 'graph-note-quiet', text: 'No problems.' });
    return;
  }
  const ul = list.createEl('ul');
  for (const d of problems) {
    const li = ul.createEl('li', { cls: classOf(d) });
    li.createSpan({ text: `Line ${d.range.start.line + 1}: ${d.message} ` });
    li.createSpan({ cls: 'graph-note-fix', text: d.data.fix });
  }
}

/** The 0-based line the field's caret is on. */
export function caretLine(t: HTMLTextAreaElement): number {
  return t.value.slice(0, t.selectionStart ?? 0).split('\n').length - 1;
}

/** The problems on the caret's line, each with its fixes as buttons: the fix offered in place. */
export function showFixes(
  fixbar: HTMLElement,
  problems: Diagnostic[],
  line: number,
  apply: (changes: FixChanges) => void,
): void {
  const here = problems.filter((d) => d.range.start.line <= line && line <= d.range.end.line);
  fixbar.empty();
  fixbar.hidden = !here.length;
  for (const d of here) {
    const row = fixbar.createDiv({ cls: classOf(d) });
    row.createSpan({ text: `${d.severity === HINT ? 'ℹ' : '⚠'} ${d.message}` });
    for (const f of d.data.fixes) button(row, f.title, null, () => apply(f.edit.changes), f.title);
    if (!d.data.fixes.length) row.createSpan({ cls: 'graph-note-fix', text: ` ${d.data.fix}` });
  }
}

/** The text with a fix's edits made, the last first so each place still holds. */
export function withFix(text: string, changes: FixChanges): string {
  const lines = text.split('\n');
  const offset = (p: { line: number; character: number }) =>
    lines.slice(0, p.line).reduce((a, l) => a + l.length + 1, 0) + p.character;
  const edits = Object.values(changes)
    .flat()
    .sort((a, b) => offset(b.range.start) - offset(a.range.start));
  let v = text;
  for (const e of edits) v = v.slice(0, offset(e.range.start)) + e.newText + v.slice(offset(e.range.end));
  return v;
}

/** What a problem is known by, so the same one is not announced twice. */
export const heardKey = (d: Diagnostic): string => `${d.range.start.line}|${d.message}`;

/** Says new problems to screen readers, without moving the focus; returns the problems now heard. */
export function announce(el: HTMLElement, problems: Diagnostic[], heard: Set<string>): Set<string> {
  const now = problems.filter((d) => d.severity !== HINT).map((d) => ({ key: heardKey(d), d })); // a hint is not a problem
  const fresh = now.filter((x) => !heard.has(x.key));
  el.setText(
    fresh.length ? `${fresh.length} new problem${fresh.length === 1 ? '' : 's'}: ${fresh[0]?.d.message ?? ''}` : '',
  );
  return new Set(now.map((x) => x.key));
}
