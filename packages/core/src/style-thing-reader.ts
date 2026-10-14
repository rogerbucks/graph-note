// Reading one thing of a style graph (editor spec §2, style_graph_checked): its properties read one by one, each fault — a
// value of the wrong type, a word not allowed, a name the styled graph does not have — a problem on its line with its fix,
// and the edit that makes the fix where there is one. Every check of a style thing reads through this.
import { nearest } from './estimates.ts';
import type { Problem } from './note-reading.ts';
import { orList, styleProblem, wordFix } from './style-graph.ts';
import type { StyleAt } from './style-graph.ts';

/** One thing of a style graph as read: its kinds, its properties, where it is, and where each property's text is. */
export interface RawThing {
  labels: string[];
  props: Record<string, unknown>;
  at: StyleAt;
  /** Where a property's quoted text is written: its 0-based line in the block and the characters it spans. */
  span(key: string): Problem['span'];
  /** Where a property's key is written: its 0-based line in the block and the characters it spans. */
  keySpan(key: string): Problem['span'];
  /** Set when the thing writes a key its kind does not know: what it lacks may be that key, misspelt, so is not yet said. */
  misspelt?: boolean;
}

/** The names of the graph a style graph styles, which every name in the style must be one of. */
export interface StyledNames {
  graph: string;
  things: Set<string>;
  kinds: Set<string>;
  types: Set<string>;
  paths: Set<string>;
  /** The property names of a kind's things, of one thing, or of a relationship type's links. */
  properties(of: { kind?: string; thing?: string; type?: string }): Set<string>;
}

/** Reads one thing's properties, reporting each fault into `out`: a value of the wrong type, a word not allowed, a name not there. */
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
      report(`${key} must be text`, `write ${key} in quotes`);
      return undefined;
    },
    number(key: string): number | undefined {
      const v = raw.props[key];
      if (v === undefined || (typeof v === 'number' && Number.isFinite(v))) return v;
      report(`${key} must be a number`, `write ${key} as a number, such as ${key}: 1`);
      return undefined;
    },
    /** A word of `among`, or undefined and a problem. */
    word<T extends string>(key: string, among: readonly T[], message: string, always = false): T | undefined {
      const v = r.text(key);
      if (v === undefined || (among as readonly string[]).includes(v)) return v as T | undefined;
      const { fix, nearest: near } = wordFix(v, among, always);
      report(
        message.replace('$', () => v),
        fix,
        edit(key, v, near ? [near] : []),
      );
      return undefined;
    },
    /** A name of the styled graph, or undefined and a problem whose fix is the nearest name. */
    name(key: string, among: Set<string>, what: string, fixWhat = what): string | undefined {
      const v = r.text(key);
      if (v === undefined || among.has(v)) return v;
      const near = nearest(v, among),
        by = !near ? [] : 'one' in near ? [near.one] : near.several;
      report(
        `${v} is not ${what} in graph ${names.graph}`,
        by.length
          ? `change ${v} to ${by.length > 1 ? 'the one you mean: ' : ''}${orList(by)}`
          : `write ${fixWhat} in graph ${names.graph}, or remove it`,
        edit(key, v, by),
      );
      return undefined;
    },
  };
  return r;
}
