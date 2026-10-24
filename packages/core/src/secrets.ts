// Secrets in a graph (editor spec §38, secrets_named_only). A graph holds a secret only by its name. A `SecretRef`
// thing names it, and where its value comes from: the environment or a secret store. The value is found when a run
// needs it, and never written into the graph.
// - A write holding a password is refused, found by the same fixed patterns every reader uses (graph spec §51). This
//   is the one deliberate exception to "flag, don't block".
// - Restricted documentation may hold one other secret, such as a key, flagged so a person sees it. A second is
//   refused, and so is any password.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';

/** The kind the graph spec library names a password by. */
const PASSWORD = 'a password or secret';

/** Whether a write may go ahead: refused with the kinds of secret found, or allowed, perhaps flagged. */
export type SecretCheck =
  { ok: true; flagged: string[] } | { ok: false; why: 'password' | 'secret' | 'more-than-one'; kinds: string[] };

/**
 * Whether `text` may be written. Any secret is refused, unless the note is restricted documentation. There, one line
 * holding a secret that is not a password is allowed and flagged.
 */
export function checkSecretWrite(text: string, options: { restricted?: boolean } = {}): SecretCheck {
  const kinds = gs.secretsIn(text);
  if (!kinds.length) return { ok: true, flagged: [] };
  if (kinds.includes(PASSWORD)) return { ok: false, why: 'password', kinds };
  if (!options.restricted) return { ok: false, why: 'secret', kinds };
  const lines = text.split('\n').filter((l) => gs.secretsIn(l).length > 0);
  if (lines.length > 1) return { ok: false, why: 'more-than-one', kinds };
  return { ok: true, flagged: kinds };
}

/** A secret named in a graph: its name, and where its value comes from. */
export interface SecretRef {
  id: string;
  name: string;
  from: 'env' | 'store';
}

/** The secrets a graph names, each a `SecretRef` thing with a name and a source. */
export function secretRefs(g: Pick<Graph, 'nodes'>): SecretRef[] {
  const out: SecretRef[] = [];
  for (const [id, [labels, p]] of g.nodes)
    if (labels.has('SecretRef') && typeof p['name'] === 'string' && (p['from'] === 'env' || p['from'] === 'store'))
      out.push({ id, name: p['name'], from: p['from'] });
  return out;
}

/** Where a run finds secret values: the environment, and the secret store, each by name. */
export interface SecretSources {
  env?: Readonly<Record<string, string | undefined>>;
  store?: { get(name: string): string | undefined };
}

/** A named secret's value, from its source, at the moment a run needs it; null when the source does not hold it. */
export function resolveSecret(ref: SecretRef, sources: SecretSources): string | null {
  const value = ref.from === 'env' ? sources.env?.[ref.name] : sources.store?.get(ref.name);
  return typeof value === 'string' && value !== '' ? value : null;
}
