// Ask an AI model about this note, in VS Code (spec §19, host_ai_first; §41, vscode_plugin). VS Code's own language
// models are offered, through its language model API. So the models, sign-ins and consents the person already chose in
// VS Code apply, and ThoughtKnot holds no key. The core keeps every other rule, as for any model (ai.ts):
// - nothing is sent while AI is off, which it is until the person turns it on in the settings;
// - the person chooses the model, the graph, what of it, and the question;
// - the note's classification is held to the ceiling set for VS Code's models, and a credential is never sent;
// - the exact request is shown beside the note, and only Send, chosen on exactly that, sends it, once;
// - the answer is written into the note as a proposal, for the person to accept or reject in the tab;
// - each send is recorded, whatever came of it, the last ones only and never the text sent.
import * as vscode from 'vscode';
import { confirmSend, prepareSend, sendPrepared, type SendRecord, type Transport } from '../../core/src/ai.ts';
import { noteWithProposal } from '../../core/src/ai-answer.ts';
import type { HostModel } from '../../core/src/ai-host.ts';
import type { ScopeChoice } from '../../core/src/ai-scope.ts';
import { gqlBlocks } from '../../core/src/fences.ts';
import { classificationOf } from '../../core/src/claude-gate.ts';
import { readNote } from '../../core/src/drawing.ts';
import { settingsFrom } from '../../core/src/settings.ts';
import { viewsOf } from '../../core/src/views.ts';
import { setLanguage, word } from '../../core/src/words.ts';
import { noteOf, placeOf, vscodeDisk } from './vscode-disk.ts';

/** How many sends the record keeps: the oldest is let go when one more is recorded. */
export const SENDS_KEPT = 200;

/** Where the record of sends is kept, in VS Code's own store for the extension. */
export const SENDS_KEY = 'thoughtknot.aiSends';

/** The note's classification, as the core reads its front matter. One that cannot be read counts above every level. */
const levelOf = (text: string): string | null => {
  const c = classificationOf(text);
  return c.kind === 'given' ? c.level : c.kind === 'unknown' ? 'unreadable' : null;
};

/** A transport that sends the core's request to `model` through VS Code, and gives the answer as the core reads one. */
export function lmTransport(model: vscode.LanguageModelChat): Transport {
  return async (request) => {
    const { messages } = JSON.parse(request.body) as { messages: { role: string; content: string }[] };
    // VS Code's API takes the person's and the model's turns only: the instructions go first, as the person's
    const said = messages.map((m) => vscode.LanguageModelChatMessage.User(m.content));
    const reply = await model.sendRequest(said, { justification: word('vscode.ai.why') });
    let content = '';
    for await (const part of reply.text) content += part;
    return { status: 200, text: JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }) };
  };
}

/** One choice of a quick pick, with what it stands for. */
type Pick<T> = vscode.QuickPickItem & { value: T };

/** What of the graph to send, as the person picks it; none when they turn away. */
async function chooseWhat(graph: string, names: string[], things: Pick<string>[]): Promise<ScopeChoice | null> {
  const kinds: Pick<ScopeChoice['what']>[] = [
    { label: word('ai.what.graph'), value: 'graph' },
    ...(names.length ? [{ label: word('ai.what.view'), value: 'view' as const }] : []),
    { label: word('ai.what.things'), value: 'things' },
  ];
  const what = await vscode.window.showQuickPick(kinds, { placeHolder: word('ai.what') });
  if (!what) return null;
  if (what.value === 'graph') return { graph, what: 'graph' };
  if (what.value === 'view') {
    const view = await vscode.window.showQuickPick(names, { placeHolder: word('ai.view') });
    return view ? { graph, what: 'view', view } : null;
  }
  const ticked = await vscode.window.showQuickPick(things, {
    canPickMany: true,
    placeHolder: word('vscode.ai.pick-things'),
  });
  return ticked ? { graph, what: 'things', things: ticked.map((t) => t.value) } : null;
}

/** Asks one of VS Code's models about `given`, or the note in the active editor, as this file describes. */
export async function askAi(context: vscode.ExtensionContext, given?: unknown): Promise<void> {
  setLanguage(vscode.env.language);
  const uri = noteOf(given);
  if (!uri) return;
  const config = vscode.workspace.getConfiguration('thoughtknot');
  const settings = settingsFrom({
    aiUse: config.get('ai.use'),
    classifications: config.get('classifications'),
    aiUnlabelled: config.get('ai.unlabelled'),
  });
  if (settings.aiUse !== 'on') {
    const open = word('vscode.ai.settings');
    if ((await vscode.window.showInformationMessage(word('vscode.ai.off'), open)) === open)
      await vscode.commands.executeCommand('workbench.action.openSettings', 'thoughtknot.ai');
    return;
  }
  const models = await vscode.lm.selectChatModels();
  if (!models.length) {
    void vscode.window.showInformationMessage(word('vscode.ai.no-models'));
    return;
  }
  const picked = await vscode.window.showQuickPick(
    models.map((m): Pick<vscode.LanguageModelChat> => ({ label: m.name, description: m.vendor, value: m })),
    { placeHolder: word('vscode.ai.pick-model') },
  );
  if (!picked) return;
  const host: HostModel = {
    name: word('vscode.ai.model-name', { name: picked.value.name }),
    model: picked.value.id,
    address: word('vscode.ai.address'),
    ceiling: config.get<string>('ai.ceiling') ?? settings.classifications[0] ?? '',
  };

  const { folder, note } = placeOf(uri);
  const disk = vscodeDisk(folder);
  const text = await disk.readText(note);
  const reading = readNote(gqlBlocks(text).map((b) => b.text));
  const graphs = [...reading.graphs].filter(([, d]) => d.boxes.length);
  if (!graphs.length) {
    void vscode.window.showInformationMessage(word('ai.nothing'));
    return;
  }
  const graph =
    graphs.length === 1
      ? graphs[0]?.[0]
      : await vscode.window.showQuickPick(
          graphs.map(([g]) => g),
          { placeHolder: word('vscode.ai.pick-graph') },
        );
  const drawn = graphs.find(([g]) => g === graph)?.[1];
  if (!graph || !drawn) return;
  const views = viewsOf(reading.texts)
    .filter((v) => !v.fault && v.graph === graph)
    .map((v) => v.name);
  const things = drawn.boxes.map((b): Pick<string> => ({ label: b.text || b.key, description: b.key, value: b.key }));
  const choice = await chooseWhat(graph, views, things);
  if (!choice) return;
  const question = await vscode.window.showInputBox({ prompt: word('ai.your-question'), value: word('ai.question') });
  if (question === undefined) return;

  const p = prepareSend({
    settings,
    model: host.name,
    host,
    note: text,
    notePath: note,
    level: levelOf(text),
    choice,
    question,
  });
  if ('refused' in p) {
    void vscode.window.showWarningMessage(p.refused);
    return;
  }
  const headers = Object.entries(p.headersShown).map(([k, v]) => `${k}: ${v}`);
  const shown = await vscode.workspace.openTextDocument({
    content: [...p.summary, '', word('ai.exactly'), '', ...headers, '', p.body, ''].join('\n'),
    language: 'markdown',
  });
  await vscode.window.showTextDocument(shown, { viewColumn: vscode.ViewColumn.Beside, preview: true });
  const send = word('ai.send');
  if (
    (await vscode.window.showInformationMessage(
      word('vscode.ai.shown', { model: host.name }),
      { modal: true },
      send,
    )) !== send
  )
    return;
  // the classification is read once more as Send is chosen: one changed meanwhile takes away what was shown
  const now = levelOf(await disk.readText(note));
  if (now !== p.level) {
    void vscode.window.showWarningMessage(word('ai.level-changed', { was: p.level ?? 'none', is: now ?? 'none' }));
    return;
  }

  const result = await sendPrepared(p, confirmSend(p), { transport: lmTransport(picked.value), key: null });
  if ('refused' in result) {
    void vscode.window.showWarningMessage(result.refused);
    return;
  }
  const sends = context.globalState.get<SendRecord[]>(SENDS_KEY) ?? [];
  await context.globalState.update(SENDS_KEY, [...sends, result.record].slice(-SENDS_KEPT));
  if ('failed' in result) {
    void vscode.window.showWarningMessage(result.failed);
    return;
  }
  // the proposal goes into the note as it is now; one the graph spec's check fails is not written
  const written = noteWithProposal(await disk.readText(note), result.proposal);
  if (typeof written !== 'string') {
    void vscode.window.showWarningMessage(word('ai.not-written', { model: host.name, why: written.refused }));
    return;
  }
  await disk.writeText(note, written);
  void vscode.window.showInformationMessage(
    word('ai.proposed', { model: host.name, count: result.proposal.changes.length }),
  );
}
