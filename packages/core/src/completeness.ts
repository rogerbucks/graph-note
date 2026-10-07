// The completeness report behind the problems badge (spec §8): each completeness rule the graph declares (§25 of the graph
// spec), as the graph library checks it — what is covered, what is deferred or overdue, and what is missing with its fix —
// with each thing named by its text, as the drawing names it.
import gs from '@graph-note/graph-spec';
import type { NoteReading } from './drawing.ts';

/** One completeness rule of a graph, as the report shows it: what it says, and what is missing, overdue or deferred. */
export interface RuleReport {
  rule: string;
  says: string;
  /** In words: "1 of 3 covered, 1 overdue, 1 missing". */
  summary: string;
  covered: number;
  counted: number;
  deferred: string[];
  overdue: string[];
  missing: { at: string; fix: string }[];
  /** Why the rule itself cannot be checked, or ''. */
  malformed: string;
}

/** The completeness report behind the badge (spec §8): every rule of the graph, and how many gaps there are in all. */
export interface CompletenessReport {
  rules: RuleReport[];
  /** How many gaps are missing across every rule. */
  gaps: number;
}

/** The completeness report of a graph, as of `today` (YYYY-MM-DD): each of its rules, checked against what is written. */
export function completenessReport(reading: NoteReading, graph: string, today: string): CompletenessReport {
  const g = reading.world[graph];
  if (!g) return { rules: [], gaps: 0 };
  const boxes = reading.graphs.get(graph)?.boxes ?? [];
  const name = (id: string) => boxes.find((b) => b.key === id)?.text ?? id;
  const rules = gs.completeness(g, today).rules.map((r): RuleReport => {
    const covered = r.met + r.excused;
    const parts = [`${covered} of ${r.counted} covered`];
    if (r.deferred.length) parts.push(`${r.deferred.length} deferred`);
    if (r.overdue.length) parts.push(`${r.overdue.length} overdue`);
    if (r.missing.length) parts.push(`${r.missing.length} missing`);
    return {
      rule: r.rule,
      says: r.says,
      summary: r.malformed ? 'cannot be checked' : parts.join(', '),
      covered,
      counted: r.counted,
      deferred: r.deferred.map(name),
      overdue: r.overdue.map(name),
      missing: r.missing.map((m) => ({ at: name(m.at), fix: m.fix })),
      malformed: r.malformed,
    };
  });
  return { rules, gaps: rules.reduce((n, r) => n + r.missing.length, 0) };
}
