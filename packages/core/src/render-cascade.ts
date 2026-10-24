// The drawing's three inputs kept apart, and cascaded (editor spec §36, render_cascade). The structure is the graph's
// things and links. The view metadata is how one view draws them. The central theming is the defaults every drawing
// starts from. A thing's look is the central default, then the view's, then the graph's own override, the later
// winning, as CSS cascades. Within each layer a rule for one thing beats a rule for its kind, which beats one for all.
//
// The structure never holds a look: `splitLooks` takes look properties out of the things, as the graph's own layer.

/** One layer of looks: by `*` for every thing, `kind:<Kind>` for a kind, or a thing's id. */
export type LookLayer = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** The three layers, least to most specific. */
export interface LookLayers {
  central: LookLayer;
  view?: LookLayer;
  own?: LookLayer;
}

/** Where each part of a look came from. */
export type LookSource = 'central' | 'view' | 'own';

/** The properties of a thing that are looks, never structure. */
export const LOOK_PROPERTIES = ['colour', 'fill', 'outline', 'shape', 'font', 'icon'] as const;

/** A thing's look from the three layers, with where each part came from. */
export function cascadeLook(
  thing: { id: string; kinds: readonly string[] },
  layers: LookLayers,
): { look: Record<string, string>; from: Record<string, LookSource> } {
  const look: Record<string, string> = {},
    from: Record<string, LookSource> = {};
  const order: [LookSource, LookLayer | undefined][] = [
    ['central', layers.central],
    ['view', layers.view],
    ['own', layers.own],
  ];
  for (const [source, layer] of order) {
    if (!layer) continue;
    const rules = [layer['*'], ...thing.kinds.map((k) => layer[`kind:${k}`]), layer[thing.id]];
    for (const rule of rules)
      for (const [k, v] of Object.entries(rule ?? {})) {
        look[k] = v;
        from[k] = source;
      }
  }
  return { look, from };
}

/** Things' properties split into structure and the graph's own looks, so the structure holds no look. */
export function splitLooks(things: Readonly<Record<string, Readonly<Record<string, unknown>>>>): {
  structure: Record<string, Record<string, unknown>>;
  own: Record<string, Record<string, string>>;
} {
  const structure: Record<string, Record<string, unknown>> = {},
    own: Record<string, Record<string, string>> = {};
  for (const [id, props] of Object.entries(things)) {
    structure[id] = {};
    for (const [k, v] of Object.entries(props))
      if ((LOOK_PROPERTIES as readonly string[]).includes(k) && typeof v === 'string') (own[id] ??= {})[k] = v;
      else structure[id][k] = v;
  }
  return { structure, own };
}
