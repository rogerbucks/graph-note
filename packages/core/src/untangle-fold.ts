// Folding a large graph (editor spec §25, slice 3): a busy hub's links drawn folded into one stub marked with their count
// (untangle_hubs), a group drawn as one box showing its count (untangle_groups), and the links running between the same
// two groups merged into shared trunks (untangle_merge). Host-free and pure: this works out only what is folded, hidden
// or merged, as a plan the layout source is written from (fold-source.ts), so the host changes the drawing and nothing
// else (untangle_data_untouched). The Python library works out the same plan (graphspec/style/folding.py), held to this
// byte for byte by the shared cases (python/graph_spec/tests/fold_cases.json).
import { adjacency } from './focus.ts';
import type { FocusEdge } from './focus.ts';
import type { Nudge } from './style-graph.ts';
import { THRESHOLDS, thresholdValue } from './thresholds.ts';

/** A thing with more links than this is a busy hub, whose links can be folded into one stub (untangle_hubs): `busy_hub`. */
export const BUSY_HUB = THRESHOLDS.busy_hub.value;

/**
 * What a drawing folds and merges, for the layout source: things not drawn, each hidden with a hub it hung from; links
 * not drawn, by their place among the drawing's links (`edgesOf`), folded into a stub or inside a folded box; each hub
 * folded, with how many links its stub stands for; every group drawn, with its things and whether it is folded into one
 * box; and whether the links between two groups are merged into trunks. Plain lists, so it crosses to a layout worker.
 */
export interface Folding {
  hidden: string[];
  folded: number[];
  hubs: [string, number][];
  groups: [string, string[], boolean][];
  merge: boolean;
}

/** Which folds are wanted: hubs folded, groups folded, links merged, and the hubs and groups opened again since. */
export interface FoldChoice {
  hubs: boolean;
  groups: boolean;
  merge: boolean;
  opened?: { hubs?: readonly string[]; groups?: readonly string[] };
}

/** The links of each thing, by their place among the drawing's links: a link to itself counted once. */
function linksByThing(edges: readonly FocusEdge[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [key, list] of adjacency(edges))
    out.set(
      key,
      list.map(([i]) => i),
    );
  return out;
}

/** The things, of `keys` and in their order, with more links than `most`: the busy hubs. */
export function busyHubs(keys: readonly string[], edges: readonly FocusEdge[], most = BUSY_HUB): string[] {
  most = thresholdValue('busy_hub', most);
  const links = linksByThing(edges);
  return keys.filter((k) => (links.get(k)?.length ?? 0) > most);
}

/**
 * The groups a drawing's nudges draw (§6), as `nudgedSource` draws their boxes: each label in the order first written,
 * with its things drawn among `keys`, each once. None when the drawing is laid out as lanes (`diagram`, §15), which draw
 * each group inside its lane.
 */
export function drawnGroups(
  nudges: readonly Pick<Nudge, 'word' | 'thing' | 'other' | 'group'>[],
  keys: Iterable<string>,
  diagram?: { type: string },
): [string, string[]][] {
  const drawn = new Set(keys),
    groups = new Map<string, string[]>();
  if (diagram?.type === 'lanes') return [];
  for (const n of nudges) {
    const things = [n.thing, n.other].filter((k): k is string => k !== undefined);
    if (n.word !== 'group' || n.group === undefined || !things.length || !things.every((k) => drawn.has(k))) continue;
    const members = groups.get(n.group) ?? [];
    for (const k of things) if (!members.includes(k)) members.push(k);
    groups.set(n.group, members);
  }
  return [...groups];
}

/**
 * The plan of what a drawing folds and merges, or undefined when it folds and merges nothing, so its source is the one
 * the Python library writes unfolded. `keys` are its things in order, `edges` its links (`edgesOf`), `groups` the groups
 * it draws (`drawnGroups`). Folded groups come first: each link inside one is folded, and its things are drawn as its box.
 * Then each busy hub outside them that is not opened again folds each of its links not folded yet into its stub; a thing
 * none of whose links is drawn any more, and no hub, is hidden with them. Merging leaves the links to the source, which
 * draws two or more running from one group to another as a trunk (fold-source.ts).
 */
export function foldPlan(
  keys: readonly string[],
  edges: readonly FocusEdge[],
  groups: readonly (readonly [string, readonly string[]])[],
  choice: FoldChoice,
): Folding | undefined {
  const openHubs = new Set(choice.opened?.hubs ?? []),
    openGroups = new Set(choice.opened?.groups ?? []);
  const plannedGroups = groups.map(([label, things]): [string, string[], boolean] => [
    label,
    [...things],
    choice.groups && !openGroups.has(label),
  ]);
  const boxed = new Map<string, string>();
  for (const [label, things, folded] of plannedGroups) if (folded) for (const k of things) boxed.set(k, label);
  const folded = new Set<number>();
  edges.forEach((e, i) => {
    const box = boxed.get(e.from);
    if (box !== undefined && box === boxed.get(e.to)) folded.add(i);
  });
  const links = linksByThing(edges),
    hubs: [string, number][] = [];
  if (choice.hubs)
    for (const key of busyHubs(keys, edges)) {
      if (boxed.has(key) || openHubs.has(key)) continue;
      const mine = (links.get(key) ?? []).filter((i) => !folded.has(i));
      if (!mine.length) continue;
      for (const i of mine) folded.add(i);
      hubs.push([key, mine.length]);
    }
  const isHub = new Set(hubs.map(([k]) => k));
  const hidden = keys.filter((k) => {
    const own = links.get(k) ?? [];
    return !boxed.has(k) && !isHub.has(k) && own.length > 0 && own.every((i) => folded.has(i));
  });
  const merge = choice.merge && plannedGroups.length > 0;
  if (!hubs.length && !boxed.size && !merge) return undefined;
  return { hidden, folded: [...folded].sort((a, b) => a - b), hubs, groups: plannedGroups, merge };
}

/**
 * The folds that hide a thing, so finding it can open them: each hub whose stub stands for one of its links, when none
 * of them is drawn (the thing is hidden with them), and the folded group whose box it is drawn as.
 */
export function foldsHiding(
  plan: Folding | undefined,
  edges: readonly FocusEdge[],
  key: string,
): { hubs: string[]; group?: string } {
  if (!plan) return { hubs: [] };
  const group = plan.groups.find(([, things, folded]) => folded && things.includes(key))?.[0];
  const hubs = !plan.hidden.includes(key)
    ? []
    : plan.hubs
        .map(([hub]) => hub)
        .filter((hub) => edges.some((e) => (e.from === hub && e.to === key) || (e.to === hub && e.from === key)));
  return group === undefined ? { hubs } : { hubs, group };
}
