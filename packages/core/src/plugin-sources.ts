// What a graph source or a graph step a plug-in adds gives back (editor spec §43, plugin_interface; §54,
// trust_source_joined). It is held as a joined graph, never as one of the person's own:
// - it carries where it came from: each place, with the plug-in it came through;
// - a source's graph starts untrusted. A step's keeps the lowest trust of what went in, so trust never rises on the way;
// - a graph with no class counts as the strictest, as an unlabelled note does. So does one whose class is not set;
// - a step's graph keeps the strictest class of what went in. A lower class it names does not lower it;
// - a graph past the read limits (spec_read_limits) is refused, and never read.
// Only a person raises trust (spec_join_trust, the mesh join); nothing here can.
import { readNote } from './drawing.ts';
import { textTooLarge } from './layout-limits.ts';
import type { NoteReading } from './note-reading.ts';
import type { PluginResult } from './plugin-calls.ts';
import type { GivenGraph, PluginSource } from './plugin-points.ts';
import type { PluginCalls } from './plugin-calls.ts';
import type { Fetched } from './sources.ts';
import { word } from './words.ts';

/** How far a graph is trusted, lowest first: `own` is the person's own notes; `trusted` a source they named trusted. */
export const TRUST_LEVELS = ['untrusted', 'trusted', 'own'] as const;

/** One of the trust levels. */
export type Trust = (typeof TRUST_LEVELS)[number];

/** A place a joined graph came from, and the plug-in it came through: `acme:orders`, or `step acme.db.merge`. */
export interface GraphOrigin {
  plugin: string;
  place: string;
}

/** A graph a plug-in gave back, held as a joined graph: where it came from, its trust and class, its text and reading. */
export interface JoinedGraph {
  origins: readonly GraphOrigin[];
  trust: Trust;
  /** Its class, one of those set. */
  level: string;
  text: string;
  reading: NoteReading;
}

const NO_TEXT = 'it gave no graph text';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What `given` is held as: a joined graph from `origin` and what went into it, or why it is refused. `levels` are the
 * classes set, lowest first. A source has no `inputs`; a step has the graphs it was given.
 */
export function joinedGraph(
  given: unknown,
  origin: GraphOrigin,
  inputs: readonly JoinedGraph[],
  levels: readonly string[],
): JoinedGraph | string {
  if (!given || typeof (given as GivenGraph).text !== 'string') return NO_TEXT;
  const { text, classification } = given as GivenGraph;
  const over = textTooLarge([text]);
  if (over && 'count' in over) {
    const values = { size: String(over.count), most: String(over.most) };
    return word(over.limit === 'text-bytes' ? 'plugins.graph.bytes' : 'plugins.graph.lines', values);
  }
  const strictest = levels.length - 1;
  const rankOf = (level: string) => {
    const at = levels.findIndex((l) => same(l, level));
    return at === -1 ? strictest : at;
  };
  // a step's graph with no class of its own keeps its inputs'; any other with none counts as the strictest
  const own = typeof classification === 'string' ? rankOf(classification) : inputs.length ? -1 : strictest;
  const rank = Math.max(own, ...inputs.map((g) => rankOf(g.level)));
  const trust = inputs.length
    ? (TRUST_LEVELS[Math.min(...inputs.map((g) => TRUST_LEVELS.indexOf(g.trust)))] ?? 'untrusted')
    : 'untrusted';
  const origins = Object.freeze([...inputs.flatMap((g) => g.origins), Object.freeze({ ...origin })]);
  const reading = readNote([text]);
  return Object.freeze({ origins, trust, level: levels[rank] ?? '', text, reading });
}

/** The answer `r` of a source or step of `plugin`, its `what`, held as a joined graph from `place`, or why not. */
export function heldGraph(
  plugin: string,
  what: string,
  r: PluginResult<unknown>,
  place: string,
  inputs: readonly JoinedGraph[],
  levels: readonly string[],
): PluginResult<JoinedGraph> {
  if (!r.ok) return r;
  const g = joinedGraph(r.value, { plugin, place }, inputs, levels);
  if (typeof g !== 'string') return { ok: true, value: g };
  const message =
    g === NO_TEXT
      ? word('plugins.graph.no-text', { what, plugin })
      : word('plugins.graph.refused', { what, plugin, why: g });
  return { ok: false, plugin, message };
}

/** The graphs a step is given: each one's text and class, and nothing of where it came from. */
export const stepInputs = (inputs: readonly JoinedGraph[]): readonly GivenGraph[] =>
  Object.freeze(inputs.map((g) => Object.freeze({ text: g.text, classification: g.level })));

/** What a registry gives of a built-in source's `fetch`. */
export interface SourceFetching {
  /** What the built-in source `scheme` finds at `target` for the note at `from`, as the person's own, or why not. */
  fetchSource: (scheme: string, target: string, from: string) => Promise<PluginResult<Fetched>>;
}

/** The call a registry makes into a built-in source's `fetch`: what is found, as the host's own, or what went wrong. */
export function fetchCalls(calls: PluginCalls, items: PluginSource[], owner: Map<string, string>): SourceFetching {
  return {
    async fetchSource(scheme: string, target: string, from: string): Promise<PluginResult<Fetched>> {
      const c = items.find((x) => x.scheme === scheme && x.fetch);
      if (!c?.fetch) return { ok: false, plugin: '', message: word('plugins.none.source', { name: scheme }) };
      const read = c.fetch;
      return calls.awaited(owner.get(scheme) ?? '', word('plugins.what.source', { title: c.title }), () =>
        read(target, from),
      );
    },
  };
}
