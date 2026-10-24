// Saved scenarios (editor spec §35, saved_scenarios). A scenario is a test run the user chose to keep. It is a Scenario
// thing the user manages like any other. It holds the process, the inputs and the transitions it took (one text, as a
// graph holds no lists). It is a record, nothing more. It is never run again on its own, never faded with time
// and never enforced. Replaying it is the user's choice, and a replay that now differs is said, never refused. A debug run nobody saved is
// thrown away when it stops (`TestRun.discard`).
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { TestRun, type TestRunOptions } from './test-runs.ts';

/** A saved scenario: its id, its process, the inputs it ran with and the transitions it took, in order. */
export interface Scenario {
  id: string;
  process: string;
  inputs: Record<string, Value>;
  took: string[];
}

/** What a replay found: the transitions taken now, and the first step where they differ from the saved ones. */
export interface Replay {
  took: string[];
  same: boolean;
  /** The first step, from 1, where the replay took another way, or null when it took the same. */
  differsAt: number | null;
}

/** A value as graph text: quoted text, a number, TRUE or FALSE; anything else is written as NULL. */
function text(v: Value): string {
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return typeof v === 'number' ? String(v) : 'NULL';
}
// inputs travel as one property each, named `input_<name>`, so the scenario stays plain graph data
const INPUT = 'input_';
// a graph holds no lists, so the transitions taken are one text, in order
const TOOK = ', ';

/** The graph text that saves a test run as a scenario named `id`. A host writes it into the note, as the user asked. */
export function scenarioText(run: TestRun, id: string): string {
  const took = run
    .pausesTaken()
    .map((p) => p.transition)
    .filter((t): t is string => t !== null);
  const inputs = Object.keys(run.startInputs)
    .sort()
    .map((k) => `, ${INPUT}${k}: ${text(run.startInputs[k] as Value)}`)
    .join('');
  return `(${id}:Scenario {process: ${text(run.process)}, took: ${text(took.join(TOOK))}${inputs}})`;
}

/** The scenarios a graph holds, in the order written. Each is as saved: nothing here reruns, fades or checks it. */
export function scenariosOf(graph: Graph): Scenario[] {
  return graph.labelled('Scenario').map((id) => {
    const p = graph.p(id);
    const inputs: Record<string, Value> = {};
    for (const k of Object.keys(p)) if (k.startsWith(INPUT)) inputs[k.slice(INPUT.length)] = p[k] as Value;
    const took = typeof p.took === 'string' && p.took ? p.took.split(TOOK) : [];
    return { id, process: typeof p.process === 'string' ? p.process : '', inputs, took };
  });
}

/** A scenario replayed on the user's asking, as a test run of its own, stepped to its end or `most` steps. */
export function replayScenario(
  live: () => Graph,
  scenario: Scenario,
  options: TestRunOptions = {},
  most = 100,
): Replay {
  const run = new TestRun(live, { ...options, process: scenario.process, inputs: scenario.inputs, id: scenario.id });
  const took: string[] = [];
  for (let i = 0; i < most; i++) {
    const p = run.step();
    if (p.ended || p.transition === null) break;
    took.push(p.transition);
  }
  run.discard();
  const at = took.findIndex((t, i) => t !== scenario.took[i]);
  const differsAt = at >= 0 ? at + 1 : took.length !== scenario.took.length ? took.length + 1 : null;
  return { took, same: differsAt === null, differsAt };
}
