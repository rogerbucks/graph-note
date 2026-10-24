// Changing the permissions, and joining them (editor spec §39). Every change is previewed first, and only the owner can
// confirm one (permission_preview).
// - The preview is a lens: it lists each grant the change would assert and each it would withdraw, and changes
//   nothing.
// - Confirming writes exactly what was previewed. A preview that no longer matches the permissions is refused, so what
//   the owner saw is what applies.
// - A rule's matches are proposed grants until then. `proposedGrants` lists them, inferred. So a person sees what a rule
//   would give, and it gives nothing (inferred_grants_never_open).
// - A join of permission graphs from several places marks a grant contested when they disagree about it, unless it is
//   the owner's. A contested grant gives nothing until a later join agrees, and the dispute lens lists it
//   (contested_grants_paused). Only the owner's own graphs can say who the owner is.
import type { Value } from '@thoughtknot/graph-spec';
import {
  Permissions,
  ruleMatches,
  type Access,
  type GrantRule,
  type Guarded,
  type PermissionGraph,
} from './permissions.ts';

/** A change to the permissions: a rule given to a role, a role given to a person, or a grant withdrawn. */
export type PermissionChange =
  | { kind: 'add-rule'; rule: Omit<GrantRule, 'status'> }
  | { kind: 'give-role'; person: string; role: string }
  | { kind: 'withdraw'; grant: string };

/** A grant a change would assert: who, what access, to which path, and by which rule. */
export interface ProposedGrant {
  id: string;
  person: string;
  access: Access;
  path: string;
  rule: string;
}

/** What a change would do, shown before it is confirmed. */
export interface PermissionPreview {
  change: PermissionChange;
  /** The grants it would assert. */
  grants: ProposedGrant[];
  /** The grants it would withdraw, by id. */
  withdrawn: string[];
}

/** A change confirmed, with the permissions after it; or why it was refused. */
export type Confirmed =
  | { ok: true; graph: PermissionGraph }
  | { ok: false; why: 'owner-must-confirm' | 'preview-out-of-date' | 'unknown-role' | 'unknown-grant' };

/** A grant's id, made from who it is for, the access and the path, so the same grant asserted twice is one. */
export const grantId = (person: string, access: Access, path: string): string => `grant:${person}/${access}/${path}`;

const proposed = (person: string, rule: Pick<GrantRule, 'id' | 'access'>, thing: Guarded): ProposedGrant => ({
  id: grantId(person, rule.access, thing.path),
  person,
  access: rule.access,
  path: thing.path,
  rule: rule.id,
});

/** Whether `person` already holds an asserted grant of `access` to `path`. */
const asserted = (p: Permissions, person: string, access: Access, path: string) =>
  p.grants(person).some((g) => g.status === 'asserted' && g.access === access && g.path === path);

/**
 * The grants the rules would give that are not yet asserted: each person's roles' rules, matched against `things`.
 * They are inferred, so they are shown and give nothing.
 */
export function proposedGrants(permissions: Permissions, things: readonly Guarded[]): ProposedGrant[] {
  const out: ProposedGrant[] = [];
  for (const person of permissions.people()) {
    if (person === permissions.owner) continue;
    for (const role of permissions.rolesOf(person))
      for (const rule of permissions.rulesOf(role))
        for (const thing of things)
          if (
            rule.status === 'asserted' &&
            ruleMatches(rule, thing) &&
            !asserted(permissions, person, rule.access, thing.path)
          )
            out.push(proposed(person, rule, thing));
  }
  return dedupe(out);
}

const dedupe = (grants: ProposedGrant[]) => [...new Map(grants.map((g) => [g.id, g])).values()];

/** What `change` would do to `permissions` for `things`, changing nothing. */
export function previewChange(
  permissions: Permissions,
  change: PermissionChange,
  things: readonly Guarded[],
): PermissionPreview {
  const grants: ProposedGrant[] = [];
  if (change.kind === 'add-rule') {
    for (const person of permissions.people())
      if (person !== permissions.owner && permissions.rolesOf(person).includes(change.rule.role))
        for (const thing of things)
          if (ruleMatches(change.rule, thing) && !asserted(permissions, person, change.rule.access, thing.path))
            grants.push(proposed(person, change.rule, thing));
  } else if (change.kind === 'give-role') {
    if (change.person !== permissions.owner)
      for (const rule of permissions.rulesOf(change.role))
        for (const thing of things)
          if (
            rule.status === 'asserted' &&
            ruleMatches(rule, thing) &&
            !asserted(permissions, change.person, rule.access, thing.path)
          )
            grants.push(proposed(change.person, rule, thing));
  }
  const withdrawn = change.kind === 'withdraw' ? [change.grant] : [];
  return { change, grants: dedupe(grants), withdrawn };
}

type Node = [Set<string>, Record<string, Value>];
const copy = (g: PermissionGraph) => ({
  nodes: new Map<string, Node>([...g.nodes].map(([id, [labels, props]]) => [id, [new Set(labels), { ...props }]])),
  edges: g.edges.map(([a, t, b, p]) => [a, t, b, { ...p }] as [string, string, string, Record<string, Value>]),
});

/**
 * Applies a previewed change, when `by` is the owner and the preview still says what the change would do. The
 * permissions are never changed in place: the graph after the change is returned.
 */
export function confirmChange(
  permissions: Permissions,
  preview: PermissionPreview,
  things: readonly Guarded[],
  by: string,
): Confirmed {
  if (permissions.owner === null || by !== permissions.owner) return { ok: false, why: 'owner-must-confirm' };
  const again = previewChange(permissions, preview.change, things);
  if (JSON.stringify(again) !== JSON.stringify(preview)) return { ok: false, why: 'preview-out-of-date' };
  const g = copy(permissions.graph);
  const { change } = preview;
  if (change.kind === 'add-rule') {
    if (!g.nodes.get(change.rule.role)?.[0].has('Role')) return { ok: false, why: 'unknown-role' };
    const props: Record<string, Value> = { access: change.rule.access, status: 'asserted' };
    if (change.rule.tag !== undefined) props['tag'] = change.rule.tag;
    if (change.rule.path !== undefined) props['path'] = change.rule.path;
    if (change.rule.minLikelihood !== undefined) props['min_likelihood'] = change.rule.minLikelihood;
    g.nodes.set(change.rule.id, [new Set(['GrantRule']), props]);
    g.edges.push([change.rule.role, 'HAS_RULE', change.rule.id, {}]);
  } else if (change.kind === 'give-role') {
    if (!g.nodes.get(change.role)?.[0].has('Role')) return { ok: false, why: 'unknown-role' };
    g.edges.push([change.person, 'HAS_ROLE', change.role, {}]);
  } else {
    const grant = g.nodes.get(change.grant);
    if (!grant?.[0].has('Grant')) return { ok: false, why: 'unknown-grant' };
    grant[1]['status'] = 'withdrawn';
  }
  for (const p of preview.grants) {
    g.nodes.set(p.id, [new Set(['Grant']), { access: p.access, path: p.path, status: 'asserted' }]);
    g.edges = g.edges.filter((e) => e[2] !== p.id && !(e[0] === p.id && e[1] === 'FROM_RULE'));
    g.edges.push([p.person, 'HOLDS', p.id, {}], [p.id, 'FROM_RULE', p.rule, {}]);
  }
  return { ok: true, graph: g };
}

/** How far a joined graph is trusted, as graph spec §21 joins name it. An untrusted graph is left out. */
export type Trust = 'own' | 'trusted' | 'untrusted';

/** One permission graph to join: where it came from and how far it is trusted. */
export interface PermissionDoc {
  id: string;
  graph: PermissionGraph;
  trust?: Trust;
}

const statusText = (v: Value | undefined) => (typeof v === 'string' ? v : 'inferred');

// what makes two copies of a grant the same grant
const GRANT_KEYS = ['status', 'access', 'path', 'node'];

/**
 * Joins permission graphs. Things and links are put together. A grant the graphs disagree about is contested, and
 * what each said is kept on it, unless it is the owner's. A graph not named own (when any is) cannot name the owner.
 */
export function joinPermissions(docs: readonly PermissionDoc[]): PermissionGraph {
  const named = docs.some((d) => d.trust !== undefined);
  const trustOf = (d: PermissionDoc): Trust => (named ? (d.trust ?? 'untrusted') : 'own');
  const joined = docs.filter((d) => trustOf(d) !== 'untrusted');
  const nodes = new Map<string, [Set<string>, Record<string, Value>]>();
  const edges = new Map<string, [string, string, string, Record<string, Value>]>();
  const copies = new Map<string, { doc: string; props: Record<string, Value> }[]>();
  for (const d of joined) {
    for (const [id, [labels, props]] of d.graph.nodes) {
      const mine = { ...props };
      if (trustOf(d) !== 'own') delete mine['owner'];
      const had = nodes.get(id);
      if (!had) nodes.set(id, [new Set(labels), mine]);
      else {
        for (const l of labels) had[0].add(l);
        for (const [k, v] of Object.entries(mine)) if (!(k in had[1])) had[1][k] = v;
      }
      if (labels.has('Grant')) (copies.get(id) ?? copies.set(id, []).get(id)!).push({ doc: d.id, props: { ...mine } });
    }
    for (const [a, t, b, p] of d.graph.edges) {
      const key = JSON.stringify([a, t, b]);
      if (!edges.has(key)) edges.set(key, [a, t, b, { ...p }]);
    }
  }
  const graph = { nodes, edges: [...edges.values()] };
  const owner = new Permissions(graph).owner;
  const holder = new Map(graph.edges.filter((e) => e[1] === 'HOLDS').map((e) => [e[2], e[0]]));
  for (const [id, seen] of copies) {
    const say = (c: { props: Record<string, Value> }) => JSON.stringify(GRANT_KEYS.map((k) => c.props[k] ?? null));
    if (new Set(seen.map(say)).size < 2 || holder.get(id) === owner) continue;
    const props = nodes.get(id)![1];
    props['status'] = 'contested';
    props['disputed'] = seen.map((c) => `${c.doc}: ${statusText(c.props['status'])}`).join('; ');
  }
  return graph;
}
