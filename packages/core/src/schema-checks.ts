// What a graph's schema leaves undeclared (graph spec model §5): types its GraphMeta does not DECLARE, as in a graph locked
// by an earlier build, and, in a locked graph, kinds and link types its blocks use that the schema does not declare.
// Warnings, each on the line where the block first says it, with a fix where one can be written.
import gs from '@thoughtknot/graph-spec';
import type { World } from '@thoughtknot/graph-spec';
import { blankText } from './block-items.ts';
import { graphOfBlock } from './blocks.ts';
import type { Problem } from './note-reading.ts';
import { S, trim, trimEnd } from './whitespace.ts';

// a thing and its kinds, and a link's type, read with whitespace as GQL names it (graph spec §3), as the reader reads them
const THING = new RegExp(`\\(${S}*([A-Za-z_]\\w*)${S}*((?::${S}*[A-Za-z_]\\w*${S}*)+)`, 'g'),
  ELEMENT_TYPE = new RegExp(`:${S}*ElementType\\b`),
  LINK_TYPE = new RegExp(`-\\[${S}*:${S}*([A-Za-z_]\\w*)`, 'g');

/** Words as a list: "a", "a and b", "a, b and c". */
const listed = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * A schema whose types its GraphMeta does not declare (graph spec model §5: each ElementType is linked from the GraphMeta
 * by DECLARES) — as a graph locked by an earlier build is. One warning for each block that writes such types, on the
 * first, whose fix adds every DECLARES missing from that block, and a GraphMeta when the graph has none.
 */
export function undeclared(whole: World, texts: string[]): Problem[] {
  const out: Problem[] = [];
  texts.forEach((text, block) => {
    const graph = graphOfBlock(text),
      g = graph ? whole[graph] : undefined;
    if (!graph || !g) return;
    const metas = g.labelled('GraphMeta');
    const declared = new Set(g.edges.filter(([s, t]) => t === 'DECLARES' && metas.includes(s)).map((e) => e[2]));
    const blanked = blankText(text);
    const missing = [...blanked.matchAll(THING)].filter(
      (m) => ELEMENT_TYPE.test(m[2] ?? '') && g.nodes.has(m[1] ?? '') && !declared.has(m[1] ?? ''),
    );
    const first = missing[0];
    if (!first) return;
    const meta = metas.find((m) => /^[A-Za-z_]\w*$/.test(m)) ?? (metas.length ? null : `${graph}_schema`);
    const nameOf = (id: string) => {
      const { name } = g.p(id);
      return typeof name === 'string' ? name : id;
    };
    const names = listed(missing.map((m) => nameOf(m[1] ?? '')));
    const lines = text.split('\n'),
      last = lines.reduce((at, l, i) => (trim(l) && !trim(l).startsWith('//') ? i : at), 0);
    out.push({
      graph,
      block,
      line: blanked.slice(0, first.index).split('\n').length,
      severity: 'warning',
      message: metas.length
        ? `the schema does not declare ${names}: its GraphMeta must DECLARE each type (§5)`
        : `the schema has no GraphMeta to declare ${names}: each type must be declared (§5)`,
      fix: meta ? `add a DECLARES link from ${meta} to each` : 'link each type from the GraphMeta by DECLARES',
      ...(meta
        ? {
            insert: {
              line: last,
              character: trimEnd(lines[last] ?? '').length,
              text:
                (metas.length ? '' : `,\n(${meta}:GraphMeta {graph: '${graph}', schema: '${graph}@1'})`) +
                missing.map((m) => `,\n(${meta})-[:DECLARES]->(${m[1]})`).join(''),
            },
            fixTitle: 'Declare each type',
          }
        : {}),
    });
  });
  return out;
}

/**
 * In a locked graph, each kind and link type a block uses that the graph's schema does not declare (§5): a warning on the
 * line where the block first uses it — unless it is already drawn as an estimate of one the schema does declare.
 */
export function undeclaredUse(whole: World, texts: string[], problems: Problem[]): Problem[] {
  const out: Problem[] = [];
  const hidden = new Set<string>(gs.SCHEMA_LABELS);
  texts.forEach((text, block) => {
    const graph = graphOfBlock(text),
      g = graph ? whole[graph] : undefined;
    if (!graph || !g) return;
    const schema = g.labelled('ElementType').length ? g : gs.schemaFor(whole, graph)[1];
    const types = schema ? schema.labelled('ElementType').map((i) => schema.p(i)) : [];
    if (!types.length) return; // a draft: there is no schema to declare anything
    const named = (kind: string) => new Set(types.filter((t) => t.kind === kind).map((t) => t.name));
    const kinds = named('node'),
      edges = named('edge');
    const blanked = blankText(text),
      seen = new Set<string>();
    const report = (name: string, what: string, at: number) => {
      if (seen.has(`${what} ${name}`)) return;
      seen.add(`${what} ${name}`);
      const line = blanked.slice(0, at).split('\n').length;
      if (problems.some((p) => p.block === block && p.line === line && p.replace?.written === name)) return;
      out.push({
        graph,
        block,
        line,
        severity: 'warning',
        message: `${name} is not ${what} the schema of graph ${graph} declares: declare it there, or use one it does`,
        fix: `declare ${name} in graph ${graph}'s schema`,
      });
    };
    for (const m of blanked.matchAll(THING))
      for (const label of (m[2] ?? '').split(':').map((l) => trim(l)))
        if (label && !hidden.has(label) && !kinds.has(label)) report(label, 'a kind', m.index);
    for (const m of blanked.matchAll(LINK_TYPE)) {
      const type = m[1] ?? '';
      if (type !== 'DECLARES' && !edges.has(type)) report(type, 'a relationship type', m.index);
    }
  });
  return out;
}
