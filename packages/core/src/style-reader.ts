// Reading one thing of a style graph (editor spec §2, style_graph_checked). Each property is read as text, a number, a
// word it allows or a name of the graph it styles. Each fault is reported as a problem on the thing's line with its
// fix. The fix is the nearest word or name where there is one, as an edit on the written word. Shared by every check of
// a style thing (style-checks.ts, link-flow.ts).
import { nearest } from './estimates.ts';
import type { Problem } from './note-reading.ts';
import { orList, styleProblem, wordFix } from './style-graph.ts';
import type { RawThing, StyledNames } from './style-checks.ts';
import { word } from './words.ts';

/** The reader of one style thing's properties, each fault pushed onto `out`. */
export type ThingReader = ReturnType<typeof reader>;

/** Reads one thing's properties, reporting each fault: a value of the wrong type, a word not allowed, a name not there. */
export function reader(raw: RawThing, names: StyledNames, out: Problem[]) {
  const report = (message: string, fix: string, edit: Pick<Problem, 'replace' | 'span'> = {}) =>
    out.push(styleProblem(names.graph, raw.at, message, fix, edit));
  const edit = (key: string, written: string, by: string[]) => {
    const span = raw.span(key);
    return by.length ? { replace: { written, with: by }, ...(span ? { span } : {}) } : {};
  };
  const r = {
    report,
    edit,
    /** A fault of something absent, said unless a misspelt key may be it: the rename comes first, then this is said. */
    missing(message: string, fix: string) {
      if (!raw.misspelt) report(message, fix);
    },
    text(key: string): string | undefined {
      const v = raw.props[key];
      if (v === undefined || typeof v === 'string') return v;
      report(word('styling.must-be-text', { key }), word('styling.must-be-text.fix', { key }));
      return undefined;
    },
    number(key: string): number | undefined {
      const v = raw.props[key];
      if (v === undefined || (typeof v === 'number' && Number.isFinite(v))) return v;
      report(word('styling.must-be-number', { key }), word('styling.must-be-number.fix', { key }));
      return undefined;
    },
    /** A word of `among`, or undefined and a problem: `message` says the word written, in place of each `$` in it. */
    word<T extends string>(
      key: string,
      among: readonly T[],
      message: string | ((written: string) => string),
      always = false,
    ): T | undefined {
      const v = r.text(key);
      if (v === undefined || (among as readonly string[]).includes(v)) return v as T | undefined;
      const { fix, nearest: near } = wordFix(v, among, always);
      const said = typeof message === 'function' ? message(v) : message.split('$').join(v);
      report(said, fix, edit(key, v, near ? [near] : []));
      return undefined;
    },
    /** A name of the styled graph, or undefined and a problem whose fix is the nearest name. */
    name(key: string, among: Set<string>, what: string, fixWhat = what): string | undefined {
      const v = r.text(key);
      if (v === undefined || among.has(v)) return v;
      const near = nearest(v, among),
        by = !near ? [] : 'one' in near ? [near.one] : near.several;
      report(
        word('styling.not-in-graph', { written: v, what, graph: names.graph }),
        nameFix(v, by, fixWhat, names.graph),
        edit(key, v, by),
      );
      return undefined;
    },
  };
  return r;
}

/** The fix for a name `written` that is not in `graph`: the nearest names `by`, else to write `what` there. */
export function nameFix(written: string, by: string[], what: string, graph: string): string {
  if (by.length > 1) return word('styling.change-to-meant', { written, among: orList(by) });
  if (by.length) return word('styling.change-to', { written, to: orList(by) });
  return word('styling.not-in-graph.fix', { what, graph });
}
