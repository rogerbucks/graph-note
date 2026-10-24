// A corporate setting's boundary rules, applied to an export (editor spec §38, boundary_rules_on_export). They apply by
// themselves, whenever a setting is given: nobody has to remember them.
// - A redaction takes out each thing with a tag, a label or a property key it names. What it removes is listed as a
//   gap, so the person sees it in the gap summary. Nothing is blocked.
// - The AI-assisted label is put on each thing an AI helped make, as the setting names it.
import type { Graph, Value } from '@thoughtknot/graph-spec';

/** One redaction: things with this tag (in their `tags` text, parted by commas), this label, or this property key. */
export interface Redaction {
  tag?: string;
  label?: string;
  key?: string;
}

/** A corporate setting's boundary rules: what it redacts, and the label AI-assisted content carries. */
export interface CorporateSetting {
  redact: readonly Redaction[];
  aiLabel: string;
}

/** A graph with the boundary rules applied: what is left, what was taken out, and what is labelled AI-assisted. */
export interface Bounded {
  graph: Pick<Graph, 'nodes' | 'edges'>;
  gaps: { kind: 'redacted'; thing: string; key?: string }[];
  aiAssisted: string[];
}

const tagsOf = (p: Record<string, Value>): string[] =>
  typeof p['tags'] === 'string'
    ? p['tags']
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

/** Whether a thing was made with an AI's help: marked so, or proposed by a model. */
const aiAssisted = (p: Record<string, Value>) => p['ai_assisted'] === true || p['proposer_kind'] === 'model';

/** `g` with the setting's rules applied. A redacted thing goes with its links; a redacted key goes from every thing. */
export function applyBoundary(g: Pick<Graph, 'nodes' | 'edges'>, setting: CorporateSetting): Bounded {
  const gaps: Bounded['gaps'] = [];
  const aiMarked: string[] = [];
  const nodes = new Map<string, [Set<string>, Record<string, Value>]>();
  const keys = setting.redact.flatMap((r) =>
    r.key !== undefined && r.tag === undefined && r.label === undefined ? [r.key] : [],
  );
  for (const [id, [labels, props]] of g.nodes) {
    const out = setting.redact.some(
      (r) => (r.tag !== undefined && tagsOf(props).includes(r.tag)) || (r.label !== undefined && labels.has(r.label)),
    );
    if (out) {
      gaps.push({ kind: 'redacted', thing: id });
      continue;
    }
    const kept = { ...props };
    for (const key of keys)
      if (key in kept) {
        delete kept[key];
        gaps.push({ kind: 'redacted', thing: id, key });
      }
    if (aiAssisted(props)) {
      kept['ai_label'] = setting.aiLabel;
      aiMarked.push(id);
    }
    nodes.set(id, [new Set(labels), kept]);
  }
  const edges = g.edges
    .filter(([a, , b]) => nodes.has(a) && nodes.has(b))
    .map(([a, t, b, p]) => [a, t, b, { ...p }]) as Graph['edges'];
  return { graph: { nodes, edges }, gaps, aiAssisted: aiMarked };
}
