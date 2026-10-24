// What the AI write tests share (editor spec §37): the proposals fixtures' graph, and writes made against it. Test
// support only — nothing here ships.
import gs from '@thoughtknot/graph-spec';
import { makeProposal } from '../src/proposals.ts';
import { BASIS } from './proposals-fixtures.js';

export { GRAPH } from './proposals-fixtures.js';
export const graphOf = (text) => Object.values(gs.worldFromStore(gs.read([text])))[0];

/** A proposal to the reader graph from `by`, with these changes. */
export const proposal = (id, changes, by = { name: 'ada', kind: 'model' }) => {
  const p = makeProposal({ id, graph: 'reader', by, basis: BASIS, changes });
  if ('refused' in p) throw new Error(p.refused);
  return p;
};

export const SMALL_ADD = proposal('small_add', [{ op: 'add', gql: "(tablet:Option {name: 'Tablet', price: 2})" }]);
export const BIG_REMOVAL = proposal('big_removal', [
  { op: 'remove-link', from: 'large_reader', type: 'ANSWERS', to: 'question' },
  { op: 'remove-thing', thing: 'large_reader' },
  { op: 'remove-thing', thing: 'question' },
  { op: 'set', thing: 'alice', key: 'name', value: "'Someone'" },
]);
