// A graph step in a note (editor spec §20: graph_step_io, step_inputs_checked, run_declared_only, step_output_proposal):
// a query block named as a step, drawn as a card that says what the step does, each point it takes a graph at and what
// that point takes, with a choice of the note's graphs and views to give it, and Run. Nothing runs when the card is
// drawn: only Run runs it, against the note as it is then, the inputs checked by the core first; what it gives is
// written beside its graph as a proposal (§17), for a person to accept or reject, never into the graph. A step that
// cannot be one says why, with no Run; reading view, which never changes a note, offers no Run.
import { Notice, TFile } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import {
  givenLabel,
  gqlBlocks,
  graphOfBlock,
  namesSharedSchema,
  noteWithProposal,
  runStep,
  stepOf,
  viewsOf,
} from '@graph-note/core';
import type { GraphStep, StepFault, StepGiven, StepRun } from '@graph-note/core';
import type GraphNotePlugin from './main';
import { renderCode } from '@graph-note/core/display/code';
import { readOnlyHere, whenPlaced } from '@graph-note/core/display/graph-view/placement';
import { editInPane } from './edit-in-pane';

const and = (xs: readonly string[]) =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

/** What can be given at a point: each graph the note's blocks write, whole, then each view of one, by its words. */
function choicesIn(texts: readonly string[]): StepGiven[] {
  const graphs = [...new Set(texts.flatMap((t) => graphOfBlock(t) ?? []))];
  const views = viewsOf([...texts]).filter((v) => !v.fault && graphs.includes(v.graph));
  return [...graphs.map((graph) => ({ graph })), ...views.map((v) => ({ graph: v.graph, view: v.name }))];
}

/** Says what a run came to, in the card and in a notice: refused and why, nothing new, or the proposal written. */
function sayRun(said: HTMLElement, step: GraphStep, run: StepRun | null): void {
  said.empty();
  if (!run) {
    said.createDiv({ cls: 'graph-note-banner', attr: { role: 'alert' }, text: 'The note is not there any more.' });
    return;
  }
  if ('refused' in run) {
    const box = said.createDiv({ cls: 'graph-note-banner', attr: { role: 'alert' } });
    box.createEl('p', { text: `Step ${step.name} did not run:` });
    const list = box.createEl('ul');
    for (const why of run.refused) list.createEl('li', { text: why });
    new Notice(`Step ${step.name} did not run: ${run.refused[0] ?? ''}`);
  } else if ('nothing' in run) {
    said.createEl('p', { attr: { role: 'status' }, text: run.nothing });
    new Notice(run.nothing);
  } else {
    const n = run.proposal.changes.length,
      done = `Step ${step.name} proposed ${n} change${n === 1 ? '' : 's'} to ${run.proposal.graph}: accept or reject each below the graph.`;
    said.createEl('p', { attr: { role: 'status' }, text: done });
    new Notice(done);
  }
}

/** Runs the step named `step` in the note at `path`, as the note is when written, and writes its proposal beside its graph. */
async function run(
  plugin: GraphNotePlugin,
  path: string,
  step: GraphStep,
  given: Record<string, StepGiven>,
): Promise<StepRun | null> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const texts = gqlBlocks(await plugin.app.vault.cachedRead(file)).map((b) => b.text);
  const shared = texts.some(namesSharedSchema) ? await plugin.sharedSchemas() : [];
  let outcome: StepRun | null = null;
  await plugin.app.vault.process(file, (note) => {
    // the step as written now, found by its graph and name
    const now = gqlBlocks(note)
      .map((b, i) => stepOf(b.text, i))
      .find((s) => s?.graph === step.graph && s.name === step.name);
    const r = runStep(note, now ?? { ...step, fault: 'it is not in the note any more' }, given, {
      at: new Date().toISOString(),
      shared,
    });
    outcome = r;
    if (!('proposal' in r)) return note;
    // a proposal the graph spec's check fails is not written, and the run says so
    const written = noteWithProposal(note, r.proposal);
    if (typeof written === 'string') return written;
    outcome = { refused: [`Step ${step.name} gave a proposal that was not written: ${written.refused}`] };
    return note;
  });
  return outcome;
}

/** Draws a step block where the note shows it: what it does and takes, the choices for each point, and Run. */
export function renderStepBlock(
  plugin: GraphNotePlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  step: GraphStep | StepFault,
): void {
  const root = el.createDiv({ cls: 'graph-note graph-note-step' });
  const info = ctx.getSectionInfo(el);
  // the step's text is edited in the pane, as an empty graph's is (§4)
  const target = info ? { path: ctx.sourcePath, line: info.lineStart, graph: step.graph } : null;
  editInPane(root.createDiv({ cls: 'graph-note-card-actions' }), plugin, target);
  if ('fault' in step) {
    root.createDiv({ cls: 'graph-note-banner', attr: { role: 'alert' }, text: `This step cannot run: ${step.fault}` });
    renderCode(root, source);
    return;
  }
  const texts = info ? gqlBlocks(info.text).map((b) => b.text) : [source];
  root.createEl('p', {
    text: `Step ${step.name} proposes links into ${step.graph}. It runs only when you press Run, and what it gives is proposed for you to accept or reject.`,
  });
  const choices = choicesIn(texts),
    picks = new Map<string, HTMLSelectElement>();
  const controls = root.createDiv({ cls: 'graph-note-step-points' });
  for (const p of step.points) {
    const row = controls.createDiv({ cls: 'graph-note-step-point' });
    const words = [...p.kinds.map((k) => `(:${k})`), ...p.types.map((t) => `[:${t}]`)];
    row.createSpan({ text: `${p.name} takes ${words.length ? and(words) : 'any graph'}` });
    const pick = row.createEl('select', { attr: { 'aria-label': `Give ${p.name}` } });
    for (const c of choices) pick.createEl('option', { text: givenLabel(c), attr: { value: givenLabel(c) } });
    pick.value = givenLabel({ graph: step.graph });
    picks.set(p.name, pick);
  }
  const said = root.createDiv({ cls: 'graph-note-step-said' });
  const press = controls.createEl('button', {
    text: 'Run',
    attr: { 'aria-label': `Run step ${step.name}`, type: 'button' },
  });
  // nothing in reading view, an embed or a hover preview may change the note (spec §3), so none of them offers Run
  whenPlaced(root, () => {
    if (!info || readOnlyHere(root)) controls.remove();
  });
  // one run at a time: Run is off from the press until what it came to is said, so a second press runs nothing
  let running = false;
  press.addEventListener('click', () => {
    if (running || !info || readOnlyHere(root)) return;
    running = true;
    press.disabled = true;
    const given: Record<string, StepGiven> = {};
    for (const [point, pick] of picks) {
      const chosen = choices.find((c) => givenLabel(c) === pick.value);
      if (chosen) given[point] = chosen;
    }
    void run(plugin, ctx.sourcePath, step, given)
      .then((r) => sayRun(said, step, r))
      .catch((e: unknown) => {
        console.error('Graph Note could not run step', step.name, e);
        new Notice(`Step ${step.name} could not run, and nothing was written.`);
      })
      .finally(() => {
        running = false;
        press.disabled = false;
      });
  });
  renderCode(root, source);
}
