// The problems behind a drawing's badge (spec §8): one by one, each with a sign as well as its words, or grouped by kind
// with the worst first when there are too many to fit a screen; and the completeness report.
import type { CompletenessReport, Problem } from '@thoughtknot/core';

/** A problem, with the note line it is on. */
export interface ShownProblem extends Problem {
  noteLine: number;
}

/** Words as a sentence: a capital first, and a full stop at the end where there is none. */
const sentence = (t: string): string => {
  const s = t.trim();
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?…]$/.test(s) ? '' : '.'}`;
};
/** A problem in words: its note line and what is wrong, then the fix, as its own sentence (spec §41, ux_copy_auto). */
export const problemText = (p: ShownProblem): string =>
  `Line ${p.noteLine}: ${p.message}${/[.!?…]$/.test(p.message.trim()) ? '' : '.'} ${sentence(p.fix)}`;
const sign = (p: Problem) => (p.severity === 'hint' ? 'ℹ Hint' : p.severity === 'warning' ? '⚠ Warning' : '✖ Error');
/** Errors first, then warnings, then hints. */
const RANK = { error: 0, warning: 1, hint: 2 };
/** More problems than this do not fit a screen, so they are grouped (spec §8). */
const GROUP_OVER = 8;

/** The kind of a problem, for grouping many: what sort of thing went wrong, in words. */
function kindOf(p: Problem): string {
  if (/no thing called|is not in graph/.test(p.message)) return 'links to things not in the graph';
  if (/is not a relationship/.test(p.message)) return 'relationship types not in the graph';
  if (/not a value|expected|cannot be read|not one word/i.test(p.message)) return 'lines that cannot be read';
  return 'other problems';
}

/** The problems — one by one, or grouped by kind with the worst first when there are many — and the completeness report. */
export function renderProblems(
  parent: HTMLElement,
  problems: ShownProblem[],
  hidden: boolean,
  completeness?: CompletenessReport,
): HTMLElement {
  const box = parent.createDiv({ cls: 'thoughtknot-problems' });
  box.hidden = hidden;
  const item = (ul: HTMLElement, p: ShownProblem) =>
    ul.createEl('li', {
      cls: `is-${p.severity}`,
      text: `${sign(p)} — ${problemText(p)}`,
    });
  if (problems.length > GROUP_OVER) {
    const groups = new Map<string, ShownProblem[]>();
    for (const p of problems) {
      const k = `${p.severity}|${kindOf(p)}`;
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    const rank = (k: string) => RANK[k.split('|')[0] as Problem['severity']];
    const order = [...groups].sort(([a, x], [b, y]) => rank(a) - rank(b) || y.length - x.length);
    for (const [k, ps] of order) {
      const d = box.createEl('details');
      d.createEl('summary', {
        text: `${k.startsWith('hint') ? 'Hint' : k.startsWith('warning') ? 'Warning' : 'Error'}: ${ps.length} × ${k.split('|')[1]}`,
      });
      const ul = d.createEl('ul');
      for (const p of ps) item(ul, p);
    }
  } else if (problems.length) {
    const ul = box.createEl('ul');
    for (const p of problems) item(ul, p);
  }
  if (completeness?.rules.length) {
    box.createEl('h4', { text: 'Completeness' });
    const ul = box.createEl('ul');
    for (const r of completeness.rules) {
      const li = ul.createEl('li', { text: `${r.says || r.rule}: ${r.malformed || r.summary}` });
      const sub = li.createEl('ul');
      for (const m of r.missing) sub.createEl('li', { cls: 'is-error', text: `✖ Missing — ${m.at}: ${m.fix}` });
      for (const x of r.overdue) sub.createEl('li', { cls: 'is-warning', text: `⚠ Overdue — ${x}` });
      for (const x of r.deferred) sub.createEl('li', { text: `◌ Deferred — ${x}` });
    }
  }
  return box;
}
