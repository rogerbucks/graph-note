// A graph step in a note (editor spec §20: graph_step_io, step_inputs_checked, run_declared_only, step_output_proposal):
// A query block named as a step, drawn as a card. The card says what the step does and each point it takes a graph at.
// It says what that point takes, with a choice of the note's graphs and views to give it, and Run.
// Nothing runs when the card is drawn. Only Run runs it, against the note as it is then.
// The core checks the inputs first. What it gives is written beside its graph as a proposal (§17), never into the graph.
// A person accepts or rejects it. A step that cannot be one says why, with no Run.
// Reading view, which never changes a note, offers no Run. A step a plug-in adds is run by that plug-in (runOutside).
import { Notice, TFile } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import {
  formatList,
  givenLabel,
  gqlBlocks,
  graphOfBlock,
  namesSharedSchema,
  noteWithProposal,
  runPluginStep,
  runStep,
  stepOf,
  viewsOf,
  word,
} from '@thoughtknot/core';
import { readInHostDirection } from '@thoughtknot/core/display/host';
import type { GraphStep, StepFault, StepGiven, StepRun } from '@thoughtknot/core';
import type ThoughtKnotPlugin from './main';
import { renderCode } from '@thoughtknot/core/display/code';
import { readOnlyHere, whenPlaced } from '@thoughtknot/core/display/graph-view/placement';
import { editInPane } from './edit-in-pane';
import { classificationOf } from './export/classification';
import { changeVaultNote, noteText } from './storage/plugin-notes';

const and = (xs: readonly string[]) => formatList([...xs]);

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
    said.createDiv({ cls: 'thoughtknot-banner', attr: { role: 'alert' }, text: word('step.gone') });
    return;
  }
  if ('refused' in run) {
    const box = said.createDiv({ cls: 'thoughtknot-banner', attr: { role: 'alert' } });
    box.createEl('p', { text: word('step.did-not-run', { name: step.name }) });
    const list = box.createEl('ul');
    for (const why of run.refused) list.createEl('li', { text: why });
    new Notice(word('step.did-not-run-why', { name: step.name, why: run.refused[0] ?? '' }));
  } else if ('nothing' in run) {
    said.createEl('p', { attr: { role: 'status' }, text: run.nothing });
    new Notice(run.nothing);
  } else {
    const done = word('step.proposed', {
      name: step.name,
      count: run.proposal.changes.length,
      graph: run.proposal.graph,
    });
    said.createEl('p', { attr: { role: 'status' }, text: done });
    new Notice(done);
  }
}

/** Runs the step named `step` in the note at `path`, as the note is when written, and writes its proposal beside its graph. */
async function run(
  plugin: ThoughtKnotPlugin,
  path: string,
  step: GraphStep,
  given: Record<string, StepGiven>,
): Promise<StepRun | null> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const text = (await noteText(plugin.app, file.path, { shown: true })) ?? '';
  const texts = gqlBlocks(text).map((b) => b.text);
  const shared = texts.some(namesSharedSchema) ? await plugin.sharedSchemas() : [];
  if (step.plugin) return runOutside(plugin, file, text, step, given, shared);
  let outcome: StepRun | null = null;
  await changeVaultNote(plugin.app, file.path, (note) => {
    // the step as written now, found by its graph and name
    const now = gqlBlocks(note)
      .map((b, i) => stepOf(b.text, i))
      .find((s) => s?.graph === step.graph && s.name === step.name);
    const r = runStep(note, now ?? { ...step, fault: word('blocks.step-gone') }, given, {
      at: new Date().toISOString(),
      shared,
    });
    outcome = r;
    if (!('proposal' in r)) return note;
    // a proposal the graph spec's check fails is not written, and the run says so
    const written = noteWithProposal(note, r.proposal);
    if (typeof written === 'string') return written;
    outcome = { refused: [word('step.not-written', { name: step.name, why: written.refused })] };
    return note;
  });
  return outcome;
}

/**
 * Runs a plug-in's step (plugin_step_named). The plug-in turned on that adds it is asked, with the inputs as the note is
 * now and the note's class. Its proposal is then written beside its graph, as any step's is.
 */
async function runOutside(
  plugin: ThoughtKnotPlugin,
  file: TFile,
  text: string,
  step: GraphStep,
  given: Record<string, StepGiven>,
  shared: string[],
): Promise<StepRun> {
  const levels = plugin.settings.classifications;
  const level = classificationOf(plugin.app, file, text, levels) ?? levels.at(-1) ?? '';
  const now = gqlBlocks(text)
    .map((b, i) => stepOf(b.text, i))
    .find((s) => s?.graph === step.graph && s.name === step.name) ?? { ...step, fault: word('blocks.step-gone') };
  const r = await runPluginStep(text, now, given, {
    at: new Date().toISOString(),
    level,
    shared,
    run: (id, inputs) => plugin.outside.runStep(id, inputs, levels),
  });
  if (!('proposal' in r)) return r;
  let outcome: StepRun = r;
  await changeVaultNote(plugin.app, file.path, (note) => {
    const written = noteWithProposal(note, r.proposal);
    if (typeof written === 'string') return written;
    outcome = { refused: [word('step.not-written', { name: step.name, why: written.refused })] };
    return note;
  });
  return outcome;
}

/** Draws a step block where the note shows it: what it does and takes, the choices for each point, and Run. */
export function renderStepBlock(
  plugin: ThoughtKnotPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  step: GraphStep | StepFault,
): void {
  const root = readInHostDirection(el.createDiv({ cls: 'thoughtknot thoughtknot-step' }));
  const info = ctx.getSectionInfo(el);
  // the step's text is edited in the pane, as an empty graph's is (§4)
  const target = info ? { path: ctx.sourcePath, line: info.lineStart, graph: step.graph } : null;
  editInPane(root.createDiv({ cls: 'thoughtknot-card-actions' }), plugin, target);
  if ('fault' in step) {
    root.createDiv({
      cls: 'thoughtknot-banner',
      attr: { role: 'alert' },
      text: word('step.cannot-run', { why: step.fault }),
    });
    renderCode(root, source);
    return;
  }
  const texts = info ? gqlBlocks(info.text).map((b) => b.text) : [source];
  root.createEl('p', {
    text: word('step.about', { name: step.name, graph: step.graph }),
  });
  const choices = choicesIn(texts),
    picks = new Map<string, HTMLSelectElement>();
  const controls = root.createDiv({ cls: 'thoughtknot-step-points' });
  for (const p of step.points) {
    const row = controls.createDiv({ cls: 'thoughtknot-step-point' });
    const words = [...p.kinds.map((k) => `(:${k})`), ...p.types.map((t) => `[:${t}]`)];
    row.createSpan({
      text: word('step.takes', { name: p.name, what: words.length ? and(words) : word('step.any-graph') }),
    });
    const pick = row.createEl('select', { attr: { 'aria-label': word('step.give', { name: p.name }) } });
    for (const c of choices) pick.createEl('option', { text: givenLabel(c), attr: { value: givenLabel(c) } });
    pick.value = givenLabel({ graph: step.graph });
    picks.set(p.name, pick);
  }
  const said = root.createDiv({ cls: 'thoughtknot-step-said' });
  const press = controls.createEl('button', {
    text: word('step.run'),
    attr: { 'aria-label': word('step.run.said', { name: step.name }), type: 'button' },
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
        console.error('ThoughtKnot could not run step', step.name, e);
        new Notice(word('step.could-not-run', { name: step.name }));
      })
      .finally(() => {
        running = false;
        press.disabled = false;
      });
  });
  renderCode(root, source);
}
