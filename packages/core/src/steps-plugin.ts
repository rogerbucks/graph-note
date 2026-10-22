// A graph step a plug-in adds, run from a note (editor spec §20, plugin_step_named; §54, trust_source_joined). A step
// block names it by its id, `// graph: trip · QUERY step example.sample.chain`, and says what it takes at each point.
// It holds no rule: the plug-in runs it.
// - The inputs are checked against the points first, as any step's are (steps-input.ts).
// - Each is given to the plug-in as a joined graph of the person's own, with the note's class.
// - What the plug-in gives back is held as a joined graph, so it is untrusted and kept to the read limits.
// - Its links new to the step's graph are offered as a proposal (§17), as any step's are. Nothing is written by the step.
import { gqlBlocks, graphOfBlock } from './blocks.ts';
import { readNote } from './drawing.ts';
import type { JoinedGraph } from './plugin-sources.ts';
import type { PluginResult } from './plugin-calls.ts';
import { valueGql } from './proposals.ts';
import { proposedRun } from './steps.ts';
import type { Step, StepFault, StepRun } from './steps.ts';
import { inputFaults, inputsFrom } from './steps-input.ts';
import type { StepGiven, StepInput } from './steps-input.ts';
import type { StepGraph } from './steps-match.ts';
import { word } from './words.ts';

/** How a host runs a plug-in's step: the step's id and its inputs, held as joined graphs, give the graph it made. */
export type RunPluginStep = (id: string, inputs: readonly JoinedGraph[]) => Promise<PluginResult<JoinedGraph> | null>;

const plain = (id: string) => /^[A-Za-z_]\w*$/.test(id);

/** One input written as a graph block: each thing with its first kind and its plain properties, then each link. */
export function inputText(name: string, g: StepGraph): string {
  const things = [...g.things]
    .filter(([id]) => plain(id))
    .map(([id, t]) => {
      const kind = [...t.kinds][0];
      const props = Object.entries(t.props).filter(
        (e): e is [string, string | number | boolean] =>
          plain(e[0]) && e[0] !== 'id' && ['string', 'number', 'boolean'].includes(typeof e[1]),
      );
      const said = props.length ? ` {${props.map(([k, v]) => `${k}: ${valueGql(v)}`).join(', ')}}` : '';
      return `(${id}${kind ? `:${kind}` : ''}${said})`;
    });
  const links = g.links.filter((l) => l.every(plain)).map(([from, type, to]) => `(${from})-[:${type}]->(${to})`);
  return [`// graph: ${name}`, [...things, ...links].join(',\n')].join('\n');
}

/** An input as the plug-in is given it: the person's own graph, with the note's class `level`. */
function joinedInput(input: StepInput, level: string): JoinedGraph {
  const text = inputText(input.point, input.graph);
  return Object.freeze({
    origins: Object.freeze([Object.freeze({ plugin: '', place: input.read })]),
    trust: 'own',
    level,
    text,
    reading: readNote([text]),
  });
}

/**
 * Runs a plug-in's step on the note as it is, with what the person gave at each point, only because they asked. The
 * step's fault, a graph the note does not write, and each input are checked first. `run` asks the plug-in turned on
 * that adds it; null means none does. The links of the graph it gives back are offered as a proposal.
 */
export async function runPluginStep(
  note: string,
  step: Step | StepFault,
  given: Readonly<Record<string, StepGiven>>,
  options: { at: string; level: string; run: RunPluginStep; shared?: string[] },
): Promise<StepRun> {
  if ('fault' in step) return { refused: [word('steps.run.cannot', { step: step.name, why: step.fault })] };
  const shared = options.shared ?? [],
    texts = gqlBlocks(note).map((b) => b.text),
    { name, graph } = step;
  if (!texts.some((t) => graphOfBlock(t) === graph)) return { refused: [word('steps.run.no-graph', { graph })] };
  const reading = readNote(texts, undefined, shared);
  const { inputs, refused } = inputsFrom(step.points, given, reading, texts);
  if (refused.length) return { refused };
  const faults = inputFaults(step.points, inputs);
  if (faults.length) return { refused: faults };
  const r = await options.run(
    name,
    inputs.map((i) => joinedInput(i, options.level)),
  );
  if (!r) return { refused: [word('steps.run.no-plugin', { step: name })] };
  if (!r.ok) return { refused: [word('steps.run.plugin-failed', { step: name, why: r.message })] };
  // the graph it gave: its first graph's things, their kinds and properties as read, and its links
  const out = Object.values(r.value.reading.world)[0];
  const g: StepGraph = { things: new Map(), links: [] };
  for (const [id, [kinds, props]] of out?.nodes ?? []) g.things.set(id, { kinds: new Set(kinds), props });
  const reason = word('steps.run.plugin-gave', { step: name });
  const found = (out?.edges ?? []).map(([s, t, d]) => ({ link: [s, t, d] as [string, string, string], reason }));
  return proposedRun({ note, step, texts, reading, inputs, g, found, at: options.at, shared });
}
