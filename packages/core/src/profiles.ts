// Personal profiles (editor spec §39, profiles_at_display, profile_settings, profiles_private). A profile is how one
// person likes a graph shown. It sets how dense, how many things at a time and which visual cues. It also sets how
// reminders are styled and how fast things play. It applies only when the graph is shown, never to the graph itself. Profiles compose: a later
// one sets what it names, the earlier ones the rest.
//
// A profile is a Profile thing in the person's own personal layer. Only the owner reads it, and only through the
// engine. A corporate view never sees it; it sees only its effect on what is shown.
import type { Graph, Value, World } from '@thoughtknot/graph-spec';
import gs from '@thoughtknot/graph-spec';

/** How dense a drawing is. */
export const DENSITIES = ['compact', 'standard', 'roomy'] as const;
/** Which visual cues a drawing adds to its words. */
export const CUES = ['words', 'icons', 'both'] as const;
/** How reminders are put. */
export const REMINDER_STYLES = ['off', 'gentle', 'firm'] as const;
/** How fast things play. */
export const PACINGS = ['calm', 'steady', 'brisk'] as const;
/** The fewest and most things shown at a time. */
export const CHUNK_RANGE = { least: 3, most: 50 } as const;

/** One density. */
export type Density = (typeof DENSITIES)[number];
/** One choice of visual cues. */
export type Cues = (typeof CUES)[number];
/** One way reminders are put. */
export type ReminderStyle = (typeof REMINDER_STYLES)[number];
/** One pace. */
export type Pacing = (typeof PACINGS)[number];

/** What a profile sets. A profile may set any of them; composing fills the rest. */
export interface ProfileSettings {
  density: Density;
  chunk: number;
  cues: Cues;
  reminders: ReminderStyle;
  pacing: Pacing;
}

/** What is shown with no profile: the drawing as everyone sees it. */
export const SHARED_SETTINGS: Readonly<ProfileSettings> = Object.freeze({
  density: 'standard',
  chunk: 12,
  cues: 'both',
  reminders: 'gentle',
  pacing: 'steady',
});

/** How long each step plays at each pacing, in milliseconds. */
export const PACE_MS: Readonly<Record<Pacing, number>> = { calm: 4000, steady: 2000, brisk: 1000 };

/** The labels that are personal: a corporate view never holds them. */
export const PERSONAL_LABELS = ['Profile', 'Learned'];

const pick = <T extends string>(all: readonly T[], v: unknown): T | undefined =>
  (all as readonly unknown[]).includes(v) ? (v as T) : undefined;

/** What one Profile thing sets, read from its properties; a value out of range is left unset. */
export function profileOf(props: Readonly<Record<string, Value>>): Partial<ProfileSettings> {
  const out: Partial<ProfileSettings> = {};
  const density = pick(DENSITIES, props.density),
    cues = pick(CUES, props.cues),
    reminders = pick(REMINDER_STYLES, props.reminders),
    pacing = pick(PACINGS, props.pacing);
  if (density) out.density = density;
  if (cues) out.cues = cues;
  if (reminders) out.reminders = reminders;
  if (pacing) out.pacing = pacing;
  const chunk = props.chunk;
  if (typeof chunk === 'number' && Number.isInteger(chunk) && chunk >= CHUNK_RANGE.least && chunk <= CHUNK_RANGE.most)
    out.chunk = chunk;
  return out;
}

/** Profiles composed, first to last, over what everyone sees: each later one sets what it names. */
export function composeProfiles(...profiles: Partial<ProfileSettings>[]): ProfileSettings {
  return Object.assign({}, SHARED_SETTINGS, ...profiles) as ProfileSettings;
}

/** The personal layer of one person: their profiles, read only by them, through the engine. */
export class PersonalLayer {
  readonly owner: string;
  #graph: Graph;

  constructor(owner: string, graph: Graph) {
    this.owner = owner;
    this.#graph = graph;
  }

  /** The owner's profiles, in the order written, for an engine-mediated reader. Anyone else is refused. */
  profiles(reader: string): { id: string; settings: Partial<ProfileSettings> }[] {
    if (reader !== this.owner) throw new Error('refused: a profile is read only by its owner');
    return this.#graph
      .labelled('Profile')
      .filter((id) => this.#graph.p(id).owner === this.owner)
      .map((id) => ({ id, settings: profileOf(this.#graph.p(id)) }));
  }

  /** What the owner's profiles compose to, for showing a graph to the owner. */
  settingsFor(reader: string): ProfileSettings {
    if (reader !== this.owner) return { ...SHARED_SETTINGS };
    return composeProfiles(...this.profiles(reader).map((p) => p.settings));
  }
}

/** A corporate view of a world: every personal thing taken out, and every link to or from one. */
export function corporateView(world: World): World {
  const out: World = {};
  for (const [name, g] of Object.entries(world)) {
    const personal = new Set(
      [...g.nodes].filter(([, [labels]]) => PERSONAL_LABELS.some((l) => labels.has(l))).map(([id]) => id),
    );
    if (!personal.size) {
      out[name] = g;
      continue;
    }
    const nodes = new Map([...g.nodes].filter(([id]) => !personal.has(id)));
    const edges = g.edges.filter(([a, , b]) => !personal.has(a) && !personal.has(b));
    out[name] = new gs.Graph(nodes, edges);
  }
  return out;
}
