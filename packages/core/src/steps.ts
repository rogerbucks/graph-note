// Graph steps (editor spec §20: graph_step_io, step_inputs_checked, run_declared_only, step_output_proposal). A step is
// a query block named as one, `// graph: <graph> · QUERY step <name>`. It names the points it takes a graph at, each
// with what it takes (`// takes <point>: (:Kind), [:TYPE]`). Then comes its rule: MATCH a pattern and INSERT the links
// it implies (steps-rule.ts). The rule is a query over graph data, never code or a named action. A step runs only when
// a host asks, which is only when the user presses Run (`runStep`). What is given at each point, a graph of the note or
// a view of one, is checked against the point first (steps-input.ts). The rule is matched over the inputs together
// (steps-match.ts). The graph it gives is offered as a proposal (§17) of the links new to the step's graph, never
// written by the step.
import gs from '@thoughtknot/graph-spec';
import { firstLine, gqlBlocks, graphOfBlock, isStepBlock } from './blocks.ts';
import { readNote } from './drawing.ts';
import { formatCount, formatList } from './locale-formats.ts';
import { linkChange, makeProposal, thingChange } from './proposals.ts';
import type { ChangeInput, Proposal } from './proposals.ts';
import { basisOf } from './proposals-basis.ts';
import { changeSetId } from './proposals-text.ts';
import { inputFaults, inputsFrom, together } from './steps-input.ts';
import type { StepGiven, StepInput, StepPoint } from './steps-input.ts';
import { MOST_MATCHES, matchesOf } from './steps-match.ts';
import type { StepMatch } from './steps-match.ts';
import { readRule, ruleWords } from './steps-rule.ts';
import type { StepRule } from './steps-rule.ts';
import { N, S, trim } from './whitespace.ts';
import { word } from './words.ts';

/** A step found in a note: its name, the graph it proposes into, its block (0-based), its points and its rule. */
export interface Step {
  name: string;
  graph: string;
  block: number;
  points: StepPoint[];
  rule: StepRule;
}

/** A block meant as a step that cannot be one, with what to change: it is never run. */
export interface StepFault {
  name: string;
  graph: string;
  block: number;
  fault: string;
}

/** The graph a step gives: the things its links join, and the links, whether or not its graph holds them already. */
export interface StepOutput {
  things: string[];
  links: [string, string, string][];
}

/** What a run came to: refused before the rule ran, with why; nothing new, with the output; or the output, proposed. */
export type StepRun =
  { refused: string[] } | { nothing: string; output: StepOutput } | { proposal: Proposal; output: StepOutput };

const STEP = new RegExp(`·${S}*QUERY${S}+step\\b(?:${S}+(${N}+))?`);
const TAKES = new RegExp(`^${S}*//${S}*takes\\b([^:]*)(?::(.*))?$`);
const WORD = /^[A-Za-z_]\w*$/;
/** The longest a step block may be, graph line and comments included: a step is a short rule (spec §9). */
export const MOST_STEP_CHARACTERS = 8192;

/** What one `// takes` line declares, or why it cannot be read. */
function pointOf(line: string): StepPoint | string {
  const m = TAKES.exec(line);
  const name = trim(m?.[1] ?? '');
  if (!WORD.test(name)) return word('steps.fault.point-name');
  const point: StepPoint = { name, kinds: [], types: [] };
  for (const raw of (m?.[2] ?? '').split(',')) {
    const item = trim(raw);
    if (!item) continue;
    const kind = /^\(:([A-Za-z_]\w*)\)$/.exec(item)?.[1],
      type = /^\[:([A-Za-z_]\w*)\]$/.exec(item)?.[1];
    if (kind) point.kinds.push(kind);
    else if (type) point.types.push(type);
    else return word('steps.fault.point-item', { item, point: name });
  }
  return point;
}

/**
 * The step a block holds, a fault saying what to change, or null when the block is not a step. A step has a name of
 * one word and says what it takes at each named point. Its rule matches no kind or type no point says it takes.
 */
export function stepOf(text: string, block = 0): Step | StepFault | null {
  // a block is a step by its graph line alone, so one that is not, however long, is never read further (§9)
  if (!isStepBlock(text)) return null;
  const head = firstLine(text);
  let graph: string | null, kind: string;
  try {
    [graph, kind] = gs.header(head);
  } catch {
    return null;
  }
  const named = STEP.exec(head);
  if (kind !== 'query' || !graph || !named) return null;
  const of = graph,
    name = named[1] ?? '',
    fault = (f: string): StepFault => ({ name, graph: of, block, fault: f });
  if (!name) return fault(word('steps.fault.no-name'));
  if (!WORD.test(name)) return fault(word('steps.fault.not-one-word', { name }));
  // a step is a short rule. A longer block is refused before its rule is read, so no text pasted or synced into a
  // note can hold the editor (§9)
  if (text.length > MOST_STEP_CHARACTERS)
    return fault(
      word('steps.fault.too-long', { most: formatCount(MOST_STEP_CHARACTERS), length: formatCount(text.length) }),
    );
  const lines = text.split('\n'),
    at = lines.findIndex((l) => trim(l));
  const body = lines.slice(at + 1),
    points: StepPoint[] = [];
  for (const line of body.filter((l) => TAKES.test(l))) {
    const p = pointOf(line);
    if (typeof p === 'string') return fault(p);
    if (points.some((x) => x.name === p.name)) return fault(word('steps.fault.point-twice', { point: p.name }));
    points.push(p);
  }
  if (!points.length) return fault(word('steps.fault.no-points'));
  const rule = readRule(body.filter((l) => !trim(l).startsWith('//')).join('\n'));
  if ('fault' in rule) return fault(rule.fault);
  const words = ruleWords(rule),
    kinds = new Set(points.flatMap((p) => p.kinds)),
    types = new Set(points.flatMap((p) => p.types));
  const loose = [
    ...words.kinds.filter((k) => !kinds.has(k)).map((k) => `(:${k})`),
    ...words.types.filter((t) => !types.has(t)).map((t) => `[:${t}]`),
  ];
  if (loose.length) return fault(word('steps.fault.loose', { loose: formatList(loose), count: loose.length }));
  return { name, graph, block, points, rule };
}

/** Every step of a note, in the order written: each the step, or its fault; a name used twice in a graph is a fault. */
export function stepsOf(texts: readonly string[]): (Step | StepFault)[] {
  const taken = new Set<string>();
  return texts.flatMap((t, i) => {
    const s = stepOf(t, i);
    if (!s) return [];
    const key = `${s.graph}/${s.name}`,
      twice = !!s.name && taken.has(key);
    taken.add(key);
    return [
      twice
        ? {
            name: s.name,
            graph: s.graph,
            block: i,
            fault: word('steps.fault.taken', { graph: s.graph, step: s.name }),
          }
        : s,
    ];
  });
}

/** The inputs given at a step's points, read from a note's blocks, and why any cannot be (steps-input.ts). */
export function inputsFor(
  step: Step,
  given: Readonly<Record<string, StepGiven>>,
  texts: readonly string[],
  shared: string[] = [],
): { inputs: StepInput[]; refused: string[] } {
  return inputsFrom(step.points, given, readNote([...texts], undefined, shared), texts);
}

/** Each input checked against what its point takes, before the step runs: the reasons it may not, none when it may. */
export function checkInputs(step: Step, inputs: readonly StepInput[]): string[] {
  return inputFaults(step.points, inputs);
}

/** A match in the pattern's own words: `(ada)-[:WORKS_ON]->(atlas)<-[:WORKS_ON]-(bob)`. */
function said(links: readonly [string, string, string][], m: StepMatch): string {
  return m.ids
    .map((id, i) => {
      if (i === 0) return `(${id})`;
      const [from, type] = links[m.links[i - 1] ?? -1] ?? ['', ''];
      return from === m.ids[i - 1] ? `-[:${type}]->(${id})` : `<-[:${type}]-(${id})`;
    })
    .join('');
}

/** The proposal's id: the step's name and the next number its change sets in the note have not used. */
function proposalId(name: string, texts: readonly string[]): string {
  const own = new RegExp(`^${name}_(\\d+)$`);
  const used = texts.map((t) => Number(own.exec(changeSetId(t)?.id ?? '')?.[1] ?? 0));
  return `${name}_${Math.max(0, ...used) + 1}`;
}

/**
 * Runs a step on the note as it is (`note`), with what the user gave at each point, only because the user asked. The
 * step's own fault, a graph the note does not write, and each input are checked first. Any fault refuses the run
 * before the rule is matched. The graph it gives is the links its INSERT names for each match. Those its graph does
 * not hold already are offered as a proposal from the step, against the graph's state now. Each comes with the match
 * that found it, and any thing they join that the graph lacks. Nothing is written: the host writes the proposal beside
 * the graph.
 */
export function runStep(
  note: string,
  step: Step | StepFault,
  given: Readonly<Record<string, StepGiven>>,
  options: { at: string; shared?: string[] },
): StepRun {
  if ('fault' in step)
    return {
      refused: [
        step.name
          ? word('steps.run.cannot', { step: step.name, why: step.fault })
          : word('steps.run.cannot-unnamed', { why: step.fault }),
      ],
    };
  const shared = options.shared ?? [],
    texts = gqlBlocks(note).map((b) => b.text),
    { name, graph } = step;
  if (!texts.some((t) => graphOfBlock(t) === graph)) return { refused: [word('steps.run.no-graph', { graph })] };
  const reading = readNote(texts, undefined, shared);
  const { inputs, refused } = inputsFrom(step.points, given, reading, texts);
  if (refused.length) return { refused };
  const faults = inputFaults(step.points, inputs);
  if (faults.length) return { refused: faults };
  const g = together(inputs);
  const { found, over } = matchesOf(step.rule, g);
  if (over) return { refused: [word('steps.run.too-many', { step: name, count: MOST_MATCHES })] };
  const at = (m: StepMatch, thing: string) => m.ids[step.rule.things.findIndex((t) => t.name === thing)] ?? '';
  const links = new Map<string, { link: [string, string, string]; m: StepMatch }>();
  for (const m of found)
    for (const ins of step.rule.insert) {
      const link: [string, string, string] = [at(m, ins.from), ins.type, at(m, ins.to)];
      if (!links.has(link.join(' '))) links.set(link.join(' '), { link, m });
    }
  const all = [...links.values()];
  const output: StepOutput = {
    things: [...new Set(all.flatMap(({ link }) => [link[0], link[2]]))],
    links: all.map(({ link }) => link),
  };
  const target = reading.world[graph],
    held = new Set(target?.edges.map(([s, t, d]) => [s, t, d].join(' ')) ?? []);
  const fresh = all.filter(({ link }) => !held.has(link.join(' ')));
  if (!fresh.length) return { nothing: word('steps.run.nothing-new', { step: name, graph }), output };
  // an id is written into the change set as a name. Only a plain word is, never text that could write a line of its
  // own
  const odd = fresh.flatMap(({ link }) => [link[0], link[2]]).find((id) => !/^[A-Za-z_]\w*$/.test(id));
  if (odd !== undefined) return { refused: [word('steps.run.odd-id', { step: name, id: JSON.stringify(odd) })] };
  const changes: ChangeInput[] = [],
    added = new Set<string>();
  for (const { link, m } of fresh) {
    for (const id of [link[0], link[2]])
      if (!target?.nodes.has(id) && !added.has(id)) {
        added.add(id);
        const t = g.things.get(id);
        const scalar = Object.entries(t?.props ?? {}).filter(
          (e): e is [string, string | number | boolean] =>
            e[0] !== 'id' && ['string', 'number', 'boolean'].includes(typeof e[1]),
        );
        const kind = [...(t?.kinds ?? [])][0];
        changes.push(kind ? thingChange(id, kind, Object.fromEntries(scalar)) : { op: 'add', gql: `(${id})` });
      }
    changes.push(linkChange(link[0], link[1], link[2], {}, { reason: `found by step ${name}: ${said(g.links, m)}` }));
  }
  const proposal = makeProposal({
    id: proposalId(name, texts),
    graph,
    by: { name, kind: 'step' },
    at: options.at,
    // the inputs as the change set records them in the note: its bytes, in UK English
    read: inputs.map((i) => `${i.point}: ${i.read}`),
    basis: basisOf(note, graph, shared),
    changes,
  });
  return 'refused' in proposal ? { refused: [proposal.refused] } : { proposal, output };
}
