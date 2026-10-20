// The block editor's help with problems (spec §4, §8). It holds the list of every problem with its line, and the
// problems on the caret's line with their fixes as buttons. It applies a fix's edits to the text, and says new problems
// to screen readers.
import { word } from '@thoughtknot/core';
import type { Diagnostic } from '@thoughtknot/core';
import { withFix } from '../fix-changes';
import type { FixChanges } from '../fix-changes';
import { button } from './editor-layout';

/** LSP DiagnosticSeverity: 1 is an error, 4 a hint. */
const HINT = 4;
const classOf = (d: Diagnostic) => (d.severity === 1 ? 'is-error' : d.severity === HINT ? 'is-hint' : 'is-warning');

export { withFix };
export type { FixChanges };

/** Whether problem `d` is on line `line`: where the fix bar shows it while the caret is there. */
const onLine = (d: Diagnostic, line: number) => d.range.start.line <= line && line <= d.range.end.line;

/**
 * Lists each problem with its line and its fix, or says there are none. A problem on the caret's `line` is left out:
 * the fix bar shows it there, so it is said once (NEURO-4).
 */
export function listProblems(list: HTMLElement, problems: Diagnostic[], line = -1): void {
  list.empty();
  const elsewhere = problems.filter((d) => !onLine(d, line));
  list.hidden = problems.length > 0 && !elsewhere.length;
  if (!problems.length) list.createEl('p', { cls: 'thoughtknot-quiet', text: word('problems.none') });
  if (!elsewhere.length) return;
  const ul = list.createEl('ul');
  for (const d of elsewhere) {
    const li = ul.createEl('li', { cls: classOf(d) });
    li.createSpan({ text: `${word('problems.at-line', { line: d.range.start.line + 1, message: d.message })} ` });
    li.createSpan({ cls: 'thoughtknot-fix', text: d.data.fix });
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
  const here = problems.filter((d) => onLine(d, line));
  fixbar.empty();
  fixbar.hidden = !here.length;
  for (const d of here) {
    const row = fixbar.createDiv({ cls: classOf(d) });
    row.createSpan({ text: `${d.severity === HINT ? 'ℹ' : d.severity === 1 ? '✖' : '⚠'} ${d.message}` });
    for (const f of d.data.fixes) button(row, f.title, null, () => apply(f.edit.changes), f.title);
    if (!d.data.fixes.length) row.createSpan({ cls: 'thoughtknot-fix', text: ` ${d.data.fix}` });
  }
}

/** What a problem is known by, so the same one is not announced twice. */
export const heardKey = (d: Diagnostic): string => `${d.range.start.line}|${d.message}`;

/** Says new problems to screen readers, without moving the focus; returns the problems now heard. */
export function announce(el: HTMLElement, problems: Diagnostic[], heard: Set<string>): Set<string> {
  const now = problems.filter((d) => d.severity !== HINT).map((d) => ({ key: heardKey(d), d })); // a hint is not a problem
  const fresh = now.filter((x) => !heard.has(x.key));
  el.setText(fresh.length ? word('problems.new', { count: fresh.length, message: fresh[0]?.d.message ?? '' }) : '');
  return new Set(now.map((x) => x.key));
}
