// The first-run journey's counts (editor spec §41, ux_journey_auto). A person opens a note, reads its graph, edits it,
// fixes a problem and exports it. Each host scripts that journey (test/repository/journey-obsidian.js and
// journey-page.js), and every action the person takes goes through a Journey, which counts it.
//
// Two counts are kept, and the quality ratchet holds both (scripts/quality-spec.mjs):
// - An interaction is one action: a click, a tap, a key, or a piece of text typed into a field.
// - A step is a run of interactions on one control. Pressing Down three times is one step. Moving on to another control
//   is the next step.
//
// A control is found by its accessible name, the name a screen reader says, never by a class. So the journey also
// shows that a person can find each control by what it is called.

/** The journey's stages, in the order a person meets them on a first run. */
export const STAGES = ['open the note', 'read the graph', 'edit it', 'fix a problem', 'export it'];

/** The hosts the journey runs in, each with the metric names that hold its counts. */
export const HOSTS = {
  obsidian: { steps: 'journey_steps_obsidian', interactions: 'journey_interactions_obsidian' },
  'claude-code': { steps: 'journey_steps_claude_code', interactions: 'journey_interactions_claude_code' },
};

/** The accessible name of `el`: its label, or the text of what labels it, or its own text. */
export function nameOf(el) {
  const label = el.getAttribute('aria-label');
  if (label) return label.trim();
  const by = el.getAttribute('aria-labelledby');
  const doc = el.ownerDocument;
  // a document without getElementById (the Obsidian test host's) is searched from its top element
  const labeller = by && (doc?.getElementById?.(by) ?? doc?.documentElement?.querySelector?.(`#${by}`));
  if (labeller) return labeller.textContent.trim();
  return (el.textContent ?? '').trim();
}

/** What a person can act on: a control, a field, or a box or link of the drawing that acts as a button. */
const CONTROLS = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"]';

/** The control inside `root` whose accessible name is `name`, or undefined. */
export function named(root, name) {
  return [...root.querySelectorAll(CONTROLS)].find((el) => nameOf(el) === name);
}

/** The counts of a trail of interactions, each `{ stage, control }`: its steps and its interactions. */
export function countsOf(trail) {
  let steps = 0;
  trail.forEach((t, i) => {
    if (i === 0 || trail[i - 1].control !== t.control) steps++;
  });
  return { steps, interactions: trail.length };
}

/**
 * One run of the journey in one host. `stage(name)` starts the next stage, in the order STAGES gives. `use(control,
 * act)` is one interaction with the control of that name: `act` is what the person does to it, and is awaited.
 */
export class Journey {
  constructor(host) {
    if (!HOSTS[host]) throw new Error(`no such host: ${host}`);
    this.host = host;
    this.trail = [];
    this.stages = [];
  }

  /** Starts the next stage of the journey; a stage out of order, or one not in it, is an error. */
  stage(name) {
    const want = STAGES[this.stages.length];
    if (name !== want) throw new Error(`the journey's next stage is "${want}", not "${name}"`);
    this.stages.push(name);
  }

  /** The person acts once on the control called `control`. */
  async use(control, act) {
    if (!this.stages.length) throw new Error('the journey has not begun: start its first stage');
    if (!control?.trim()) throw new Error('an interaction names the control it is made on');
    this.trail.push({ stage: this.stages.at(-1), control });
    return act();
  }

  /** The counts so far, with the metric names that hold them. */
  get counts() {
    return countsOf(this.trail);
  }

  /** The counts as metrics of the quality ratchet. A journey that did not reach its last stage has none. */
  metrics() {
    if (this.stages.length !== STAGES.length)
      throw new Error(`the journey in ${this.host} stopped after "${this.stages.at(-1) ?? 'nothing'}"`);
    const { steps, interactions } = this.counts;
    return { [HOSTS[this.host].steps]: steps, [HOSTS[this.host].interactions]: interactions };
  }
}
