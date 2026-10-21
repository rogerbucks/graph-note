// A change as the statement a change set holds (editor spec §17, §24 of the graph spec). An addition is the item as a
// block writes it, and a change of a property is a `SET`. A removal is a `DELETE` of exactly one thing or link. So
// every tool that reads GQL reads them, and graph-spec's own check dry-runs them. A change's id is derived from its
// statement by the graph library, never written by anyone. So the same change has the same id wherever it is read.
// This module writes a statement from a change and reads one back, with the library's own reading of it.
import gs from '@thoughtknot/graph-spec';
import { blankText } from './block-items.ts';
import type { ChangeOp } from './proposals.ts';
import { trim } from './whitespace.ts';
import { word } from './words.ts';

/** The statement that makes a change, as a change set holds it: the item for an addition, else a SET or a DELETE. */
export function statementOf(c: ChangeOp): string {
  if (c.op === 'add') return c.gql;
  const kinds = (labels?: readonly string[]) => (labels ?? []).map((l) => `:${l}`).join('');
  if (c.op === 'set')
    return c.labels?.length
      ? `MATCH (v${kinds(c.labels)} {id: ${gs.quote(c.thing)}}) SET v.${c.key} = ${c.value}`
      : `SET ${c.thing}.${c.key} = ${c.value}`;
  // a thing goes with the links it has unless the statement is a plain DELETE (`detach: false`). That keeps to what the
  // graph spec says of it: no link left without its end
  if (c.op === 'remove-thing')
    return `MATCH (v${kinds(c.labels)} {id: ${gs.quote(c.thing)}}) ${c.detach === false ? '' : 'DETACH '}DELETE v`;
  const [a, b] = c.ends ?? [[], []];
  return `MATCH (a${kinds(a)} {id: ${gs.quote(c.from)}})-[r:${c.type}]->(b${kinds(b)} {id: ${gs.quote(c.to)}}) DELETE r`;
}

/** An addition's text as its tokens, so spacing never changes what it is. */
function shapeOf(gql: string): string {
  try {
    return gs
      .tokens(gql)
      .map((t) => `${t[0]}:${t[3]}`)
      .join(' ');
  } catch (e) {
    if (e instanceof gs.ProfileError) return trim(gql);
    throw e;
  }
}

/**
 * A change's id, derived from its statement and never written. A DELETE or a SET has the id the graph library gives it
 * (the one `checkChangeset` reports). An addition has the sixteen digits of its tokens' hash. The same change, written
 * either way, has the same id.
 */
export function changeIdOf(c: ChangeOp): string {
  if (c.op === 'add') return gs.hash16({ op: 'add', gql: shapeOf(c.gql) });
  try {
    return gs.changeId(gs.readChange(statementOf(c)));
  } catch (e) {
    if (e instanceof gs.ProfileError) return gs.hash16({ op: c.op, statement: statementOf(c) });
    throw e;
  }
}

/**
 * The change a DELETE or SET statement makes, read as the check reads it; or why the editor cannot review it. A SET of
 * a link's property, or of more than one property, is the library's to check. This editor does not list it, since
 * each row is one change of one value.
 */
export function readStatement(text: string): ChangeOp | { refused: string } {
  let c;
  try {
    c = gs.readChange(text);
  } catch (e) {
    if (e instanceof gs.ProfileError) return { refused: `${e.msg}: ${e.fix}` };
    throw e;
  }
  const labels = c.labels?.length ? { labels: c.labels } : {};
  // a plain DELETE stays plain, and the kinds the MATCH names are kept: the target must have them
  if (c.op === 'delete-thing' || c.op === 'detach-delete-thing')
    return {
      op: 'remove-thing',
      thing: c.thing ?? '',
      ...(c.op === 'delete-thing' ? { detach: false as const } : {}),
      ...labels,
    };
  if (c.op === 'delete-link') {
    const ends =
      c.ends && (c.ends[0]?.length || c.ends[1]?.length)
        ? { ends: [c.ends[0] ?? [], c.ends[1] ?? []] as [string[], string[]] }
        : {};
    return { op: 'remove-link', from: c.from ?? '', type: c.type ?? '', to: c.to ?? '', ...ends };
  }
  const keys = Object.keys(c.set ?? {});
  if (c.op === 'set-link') return { refused: word('proposing.statement.link-set') };
  if (keys.length !== 1) return { refused: word('proposing.statement.one-set') };
  // the value as it is written: what follows the = of the one assignment, in the text with its strings blanked
  const at = /\bSET\s+[A-Za-z_]\w*\s*\.\s*[A-Za-z_]\w*\s*=/i.exec(blankText(text));
  const value = at ? trim(text.slice(at.index + at[0].length)) : '';
  return { op: 'set', thing: c.thing ?? '', key: keys[0] ?? '', value, ...labels };
}
