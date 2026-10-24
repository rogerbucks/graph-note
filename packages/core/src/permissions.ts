// Permissions (editor spec §39). Who may read or write a thing through a surface the engine serves. Nothing here reads
// a note: a host asks first, and opens a note only when the answer is yes (permissions_before_read).
// - The permissions are graph data, kept outside the notes (permissions_graph_native). A role is a type (`Role`). A
//   person is an instance of it (`Person`, linked to it by HAS_ROLE), with their own attributes.
// - Each role holds its own rules (`GrantRule`, linked by HAS_RULE). A rule matches things by a tag, a path, a least
//   likelihood or all of them. A role never inherits from another, and a role with no rules gives nothing
//   (role_grant_rules).
// - A grant (`Grant`, held by a person, linked to its rule by FROM_RULE) names one access, read or write, to one path
//   or node. It gives access only while it, its rule and the person's role are asserted (default_no_access). An
//   inferred grant is listed but gives nothing (inferred_grants_never_open). A contested or withdrawn one stops at once.
// - A rule only proposes grants, and the owner asserts them (permissions-change.ts). So certainty never opens anything.
//   A thing growing more certain may make a rule match it. That proposes a grant, never asserts one
//   (grant_status_only_revokes).
// - The owner, the one person marked `owner: TRUE`, may always read and write. No join can contest that.
// Changing the permissions and joining them are in permissions-change.ts.
import type { Graph, Value } from '@thoughtknot/graph-spec';

/** What a grant allows. Write never implies read: each is granted on its own. */
export type Access = 'read' | 'write';

/** A grant's status. Only an asserted grant gives access. */
export const GRANT_STATUSES = ['asserted', 'inferred', 'contested', 'withdrawn'] as const;
/** One grant status. */
export type GrantStatus = (typeof GRANT_STATUSES)[number];

/** The likelihood words of graph spec §20, least likely first, so a rule's least likelihood can be compared. */
const LIKELIHOOD = [
  'almost-no-chance',
  'very-unlikely',
  'unlikely',
  'even-chance',
  'likely',
  'very-likely',
  'almost-certain',
];

/** The graph the permissions are read from: its things and its links. A `Graph` from the graph spec library is one. */
export type PermissionGraph = Pick<Graph, 'nodes' | 'edges'>;

/** A thing a surface asks for: its path in the store, its node id, its tags and its likelihood word, as the host knows them. */
export interface Guarded {
  path: string;
  id?: string;
  tags?: readonly string[];
  likelihood?: string;
}

/** A rule a role holds: the access it gives, and what it matches. One with nothing to match matches nothing. */
export interface GrantRule {
  id: string;
  role: string;
  access: Access;
  tag?: string;
  /** A path, or a folder the path is in. */
  path?: string;
  /** The least likelihood word a thing must have. */
  minLikelihood?: string;
  status: GrantStatus;
}

/** Why a grant gives no access, as a code a host turns into words. */
export type NoAccess =
  'not-asserted' | 'no-rule' | 'not-their-role' | 'rule-not-asserted' | 'other-thing' | 'other-access' | 'no-grant';

/** One grant as a person inspects it: what it is for, its status, its rule and role, and whether it gives access. */
export interface GrantView {
  id: string;
  person: string;
  access: Access;
  path?: string;
  node?: string;
  status: GrantStatus;
  rule: string | null;
  role: string | null;
  /** What each joined graph said, when they disagree: `graph: status` for each. */
  disputed?: string;
}

/** Whether access is given, and if not, why. */
export type Answer = { ok: true } | { ok: false; why: NoAccess };

const text = (v: Value | undefined): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const statusOf = (v: Value | undefined): GrantStatus =>
  typeof v === 'string' && (GRANT_STATUSES as readonly string[]).includes(v) ? (v as GrantStatus) : 'inferred';
const accessOf = (v: Value | undefined): Access | null => (v === 'read' || v === 'write' ? v : null);

/** Whether `path` is `at` or inside the folder `at`. */
export function pathWithin(path: string, at: string): boolean {
  const folder = at.endsWith('/') ? at : `${at}/`;
  return path === at || path.startsWith(folder);
}

/** Whether `rule` matches `thing`: every condition it names holds, and it names at least one. */
export function ruleMatches(rule: Pick<GrantRule, 'tag' | 'path' | 'minLikelihood'>, thing: Guarded): boolean {
  if (rule.tag === undefined && rule.path === undefined && rule.minLikelihood === undefined) return false;
  if (rule.tag !== undefined && !(thing.tags ?? []).includes(rule.tag)) return false;
  if (rule.path !== undefined && !pathWithin(thing.path, rule.path)) return false;
  if (rule.minLikelihood !== undefined) {
    const least = LIKELIHOOD.indexOf(rule.minLikelihood);
    const has = LIKELIHOOD.indexOf(thing.likelihood ?? '');
    if (least < 0 || has < least) return false;
  }
  return true;
}

/** The permissions read from a graph. It answers who may read or write a thing, and lists every grant for inspection. */
export class Permissions {
  readonly graph: PermissionGraph;
  readonly owner: string | null;
  private readonly rules = new Map<string, GrantRule>();
  private readonly roles = new Map<string, Set<string>>();
  private readonly held: GrantView[] = [];

  constructor(graph: PermissionGraph) {
    this.graph = graph;
    const labelled = (label: string) => [...graph.nodes].filter(([, [labels]]) => labels.has(label));
    const owners = labelled('Person').filter(([, [, p]]) => p['owner'] === true);
    // two owners is no owner: the permissions fail closed
    this.owner = owners.length === 1 ? owners[0]![0] : null;
    const isRole = new Set(labelled('Role').map(([id]) => id));
    const ruleRole = new Map<string, string>();
    const ruleOf = new Map<string, string>();
    for (const [from, type, to, p] of graph.edges) {
      if (type === 'HAS_ROLE' && isRole.has(to) && (p['status'] === undefined || p['status'] === 'asserted'))
        (this.roles.get(from) ?? this.roles.set(from, new Set()).get(from)!).add(to);
      if (type === 'HAS_RULE' && isRole.has(from) && !ruleRole.has(to)) ruleRole.set(to, from);
      if (type === 'FROM_RULE' && !ruleOf.has(from)) ruleOf.set(from, to);
    }
    for (const [id, [, p]] of labelled('GrantRule')) {
      const role = ruleRole.get(id);
      const access = accessOf(p['access']);
      if (!role || !access) continue;
      const rule: GrantRule = {
        id,
        role,
        access,
        status: p['status'] === undefined ? 'asserted' : statusOf(p['status']),
      };
      const tag = text(p['tag']);
      const path = text(p['path']);
      const least = text(p['min_likelihood']);
      if (tag !== undefined) rule.tag = tag;
      if (path !== undefined) rule.path = path;
      if (least !== undefined) rule.minLikelihood = least;
      this.rules.set(id, rule);
    }
    const holder = new Map(graph.edges.filter((e) => e[1] === 'HOLDS').map((e) => [e[2], e[0]]));
    for (const [id, [, p]] of labelled('Grant')) {
      const person = holder.get(id);
      const access = accessOf(p['access']);
      if (!person || !access) continue;
      const rule = ruleOf.get(id) ?? null;
      const view: GrantView = {
        id,
        person,
        access,
        status: statusOf(p['status']),
        rule,
        role: (rule && this.rules.get(rule)?.role) ?? null,
      };
      const path = text(p['path']);
      const node = text(p['node']);
      const disputed = text(p['disputed']);
      if (path !== undefined) view.path = path;
      if (node !== undefined) view.node = node;
      if (disputed !== undefined) view.disputed = disputed;
      this.held.push(view);
    }
  }

  /** Every grant, whatever its status, so an inferred or contested one can be seen and inspected. */
  grants(person?: string): GrantView[] {
    return this.held.filter((g) => person === undefined || g.person === person).map((g) => ({ ...g }));
  }

  /** The rules `role` holds, its own only. */
  rulesOf(role: string): GrantRule[] {
    return [...this.rules.values()].filter((r) => r.role === role).map((r) => ({ ...r }));
  }

  /** Every rule, of every role. */
  allRules(): GrantRule[] {
    return [...this.rules.values()].map((r) => ({ ...r }));
  }

  /** The roles `person` holds. */
  rolesOf(person: string): string[] {
    return [...(this.roles.get(person) ?? [])];
  }

  /** The people the graph names, the owner first. */
  people(): string[] {
    const all = [...this.graph.nodes].filter(([, [labels]]) => labels.has('Person')).map(([id]) => id);
    return this.owner ? [this.owner, ...all.filter((p) => p !== this.owner)] : all;
  }

  /** Whether one grant gives `access` to `thing` now, and if not, why. */
  gives(grant: GrantView, access: Access, thing: Guarded): Answer {
    if (grant.access !== access) return { ok: false, why: 'other-access' };
    const here =
      grant.path !== undefined ? grant.path === thing.path : grant.node !== undefined && grant.node === thing.id;
    if (!here) return { ok: false, why: 'other-thing' };
    if (grant.status !== 'asserted') return { ok: false, why: 'not-asserted' };
    const rule = grant.rule ? this.rules.get(grant.rule) : undefined;
    if (!rule) return { ok: false, why: 'no-rule' };
    if (!this.rolesOf(grant.person).includes(rule.role)) return { ok: false, why: 'not-their-role' };
    if (rule.status !== 'asserted') return { ok: false, why: 'rule-not-asserted' };
    if (rule.access !== access) return { ok: false, why: 'other-access' };
    return { ok: true };
  }

  /** Whether `person` may have `access` to `thing`: the owner always, anyone else only by an asserted grant that holds. */
  check(person: string, access: Access, thing: Guarded): Answer {
    if (this.owner !== null && person === this.owner) return { ok: true };
    let why: NoAccess = 'no-grant';
    for (const grant of this.held) {
      if (grant.person !== person) continue;
      const answer = this.gives(grant, access, thing);
      if (answer.ok) return answer;
      // the reason nearest to giving access is the one shown
      if (answer.why !== 'other-access' && answer.why !== 'other-thing') why = answer.why;
    }
    return { ok: false, why };
  }

  /** Whether `person` may have `access` to `thing`. */
  allows(person: string, access: Access, thing: Guarded): boolean {
    return this.check(person, access, thing).ok;
  }
}

/** The lens of who may have `access` to `thing`: exactly the owner and the people an asserted grant gives it to. */
export function whoCan(permissions: Permissions, access: Access, thing: Guarded): string[] {
  return permissions.people().filter((p) => permissions.allows(p, access, thing));
}

/** The lens of the grants in dispute: each contested grant, with what each joined graph said of it. */
export function disputes(permissions: Permissions): GrantView[] {
  return permissions.grants().filter((g) => g.status === 'contested');
}

/** The lens of grants that give nothing yet: each inferred grant, listed so a person can inspect it and assert it. */
export function inferredGrants(permissions: Permissions): GrantView[] {
  return permissions.grants().filter((g) => g.status === 'inferred');
}

/** Where the engine reads a note from, by its path. */
export interface NoteSource {
  read(path: string): string;
}

/** A note the engine read for someone, or why it did not open it. */
export type GuardedRead = { ok: true; text: string } | { ok: false; why: NoAccess };

/**
 * Reads `thing` for `person` through an engine-mediated surface. The permissions are checked first, and a note refused
 * is never opened: `source` is not called for it (permissions_before_read).
 */
export function readGuarded(permissions: Permissions, person: string, thing: Guarded, source: NoteSource): GuardedRead {
  const answer = permissions.check(person, 'read', thing);
  if (!answer.ok) return answer;
  return { ok: true, text: source.read(thing.path) };
}

/** The things `person` may read, of those given, in their order: a listing shows no more than this. */
export function readable(permissions: Permissions, person: string, things: readonly Guarded[]): Guarded[] {
  return things.filter((t) => permissions.allows(person, 'read', t));
}
