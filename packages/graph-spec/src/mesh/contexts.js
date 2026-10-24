// Contexts: where links may join (editor spec §61). A context is a named boundary, written as graph data: a note, a
// folder, a vault or a client.
// - Every graph belongs to exactly one context (context_named). A client context names its graphs. A note or folder
//   context holds the graphs whose notes are there. A graph no context claims belongs to the vault.
// - Same-name guesses inside one context stay as §27 has them. A guess across contexts is shown only when one of its
//   contexts turns guesses on. A view's filter may turn them on or off over that, changing only what is shown
//   (context_guess_default, context_guess_filter).
// - Things of the same name in two contexts are never compared (context_names_apart). The exceptions: both graphs
//   name the same shared schema, or a SAME_AS link joins them.
// - A SAME_AS link across contexts is written by a person only. One an AI or a join proposes waits, and a written one is
//   listed in both contexts (context_same_as_confirmed).
// - Nothing from a context the viewer cannot read reaches a guess, a suggestion or a search (context_no_leak). An AI
//   asked in one context reads only that context.
'use strict';

const { sameAs } = require('./same-as.js');
const { schemaFor } = require('../graph/graph.js');

// the kinds a context may be, most particular first: a graph claimed by two goes to the more particular
const KINDS = ['client', 'note', 'folder', 'vault'];

// a graph's or a thing's name: one word, so a link written from it is only ever that link
const WORD = /^[A-Za-z_][A-Za-z0-9_]*$/;
const inFolder = (path, folder) => path.startsWith(folder.endsWith('/') ? folder : `${folder}/`);
const graphOfWhere = (at) => at.slice(0, at.indexOf('/'));

/**
 * The contexts of a world, from the graph `options.graph` names (`contexts` when none is named), and the one each
 * graph belongs to. `options.notes` gives each graph's note path, for note and folder contexts. A graph none claims
 * belongs to `options.vault` (`vault` when none is named).
 */
function contextsOf(world, options = {}) {
  const { graph = 'contexts', notes = {}, vault = 'vault' } = options;
  const g = world[graph];
  const contexts = { [vault]: { kind: 'vault', guessesAcross: false } };
  const claims = new Map();
  const claim = (graphName, name, kind, depth) => {
    const rank = [KINDS.indexOf(kind), -depth];
    const had = claims.get(graphName);
    if (!had || rank[0] < had.rank[0] || (rank[0] === had.rank[0] && rank[1] < had.rank[1]))
      claims.set(graphName, { name, rank });
  };
  if (g)
    for (const id of g.labelled('Context')) {
      const p = g.p(id);
      const kind = KINDS.includes(p.kind) ? p.kind : 'client';
      contexts[id] = { kind, guessesAcross: p.guesses_across === true };
      if (kind === 'vault') continue;
      for (const [, , to] of g.out(id, 'CONTAINS')) if (g.has(to, 'Ref')) claim(String(g.p(to).graph), id, kind, 0);
      if (typeof p.path === 'string')
        for (const [graphName, path] of Object.entries(notes))
          if (kind === 'note' ? path === p.path : inFolder(path, p.path)) claim(graphName, id, kind, p.path.length);
    }
  const byGraph = {};
  for (const name of Object.keys(world).sort())
    if (name !== graph) byGraph[name] = claims.has(name) ? claims.get(name).name : vault;
  return { contexts, byGraph, vault, graph };
}

/** The context a `graph/key` name is in. */
const contextAt = (ctx, at) => ctx.byGraph[graphOfWhere(at)] ?? ctx.vault;

/**
 * The same-name guesses to show. A guess inside one context is shown as §27 lists it. One across contexts is shown when
 * `view.acrossContexts` says so, or else when one of its contexts turns guesses on. A thing in a context the viewer
 * cannot read (`canRead`) is left out, and a guess left with one thing is no guess.
 */
function contextGuesses(world, ctx, view = {}, canRead = () => true) {
  const out = [];
  for (const guess of sameAs(world).guesses) {
    const things = guess.things.filter(
      (at) => at.slice(0, at.indexOf('/')) !== ctx.graph && canRead(contextAt(ctx, at)),
    );
    if (things.length < 2) continue;
    const kinds = [...new Set(things.map((at) => contextAt(ctx, at)))];
    const across = kinds.length > 1;
    const shown = !across
      ? true
      : typeof view.acrossContexts === 'boolean'
        ? view.acrossContexts
        : kinds.some((k) => ctx.contexts[k]?.guessesAcross);
    if (!shown) {
      // across contexts and not shown: only the guesses inside each context are kept
      for (const k of kinds) {
        const inside = things.filter((at) => contextAt(ctx, at) === k);
        if (inside.length > 1) out.push({ name: guess.name, things: inside, across: false });
      }
      continue;
    }
    out.push({ name: guess.name, things, across });
  }
  return out;
}

/**
 * Whether two things may be compared or joined. Things in one context may be. So may two whose graphs name one shared
 * schema, or that a SAME_AS link makes one. Two things in two contexts are otherwise kept apart, whatever their names.
 */
function comparable(world, ctx, a, b) {
  if (contextAt(ctx, a) === contextAt(ctx, b)) return true;
  const [sa] = schemaFor(world, graphOfWhere(a));
  const [sb] = schemaFor(world, graphOfWhere(b));
  if (sa && sa === sb) return true;
  return sameAs(world).ones.some((one) => one.includes(a) && one.includes(b));
}

/**
 * What becomes of a proposed SAME_AS link from `from` to `to` (each `{ graph, thing }`), by `by` (`{ kind, name }`, a
 * kind of person, model, step or join). Across contexts, only a person's is written; any other waits for a person.
 * Inside one context it is written, as §27 has it. The link is written as text a host appends to `from`'s graph.
 */
function proposeSameAs(ctx, from, to, by) {
  if (![from.graph, from.thing, to.graph, to.thing].every((n) => WORD.test(String(n))))
    return { status: 'refused', why: 'not-a-name' };
  const across = (ctx.byGraph[from.graph] ?? ctx.vault) !== (ctx.byGraph[to.graph] ?? ctx.vault);
  if (across && by.kind !== 'person') return { status: 'waiting', for: 'person', from, to, by };
  const ref = `same_as_${to.graph}_${to.thing}`;
  const text = `(${ref}:Ref {graph: '${to.graph}', ref: '${to.thing}'}),\n(${from.thing})-[:SAME_AS]->(${ref})`;
  return { status: 'write', graph: from.graph, text, across };
}

/** The SAME_AS links that cross into or out of `context`: listed on both sides, so either can see and remove one. */
function sameAsAcross(world, ctx, context) {
  const out = [];
  for (const graph of Object.keys(world).sort()) {
    const g = world[graph];
    for (const [from, type, to] of g.edges) {
      if (type !== 'SAME_AS' || !g.has(to, 'Ref')) continue;
      const ref = g.p(to);
      const a = ctx.byGraph[graph] ?? ctx.vault;
      const b = ctx.byGraph[ref.graph] ?? ctx.vault;
      if (a !== b && (a === context || b === context))
        out.push({ from: `${graph}/${from}`, to: `${ref.graph}/${ref.ref}`, contexts: [a, b] });
    }
  }
  return out;
}

/** The world as one context sees it: only its own graphs. An AI asked in a context is given no more than this. */
function worldIn(world, ctx, context) {
  const out = Object.create(null);
  for (const [graph, in_] of Object.entries(ctx.byGraph)) if (in_ === context) out[graph] = world[graph];
  return out;
}

/**
 * The things whose name or text holds `text`, as `graph/key`, from the contexts the viewer can read only. A search
 * names nothing from a context it cannot.
 */
function searchContexts(world, ctx, text, canRead = () => true) {
  const want = String(text).toLowerCase();
  const out = [];
  for (const [graph, context] of Object.entries(ctx.byGraph)) {
    if (!canRead(context)) continue;
    for (const [key, [, p]] of world[graph].nodes)
      if (key.toLowerCase().includes(want) || Object.values(p).some((v) => String(v).toLowerCase().includes(want)))
        out.push(`${graph}/${key}`);
  }
  return out.sort();
}

module.exports = { contextsOf, contextGuesses, comparable, proposeSameAs, sameAsAcross, worldIn, searchContexts };
