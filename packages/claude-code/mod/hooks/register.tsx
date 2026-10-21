// /graph: draws a graph note's first graph in a pane, with the ThoughtKnot core (spec §10, a Claude Code host). Reading,
// the layout source and theming run here, in the mod's own environment (graph.js); Graphviz runs as a process through
// node (bin/render.mjs), since a mod has no WebAssembly. Where no drawing can be, the pane shows the graph as text with
// the reason: when node is missing, on the terminal (which draws no Svg), and for a graph too large to draw.
//
// /graph edit <note> starts the session's browser editor (spec §26, bin/editor-server.mjs) and draws, in a pane of its
// own, the address to open in the browser pane. The address carries the session's secret token, so it is drawn and
// copied and goes nowhere else: not into the command's answer, a log line, a toast, state or the conversation
// (cc_transcript_clean). /graph stop stops the server; so does the session ending. When the server cannot start, the
// answer says why and the pane shows the drawing /graph gives.
import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register } from 'claude-code';

import type { GraphView } from '../types';
import {
  dataFolderRefusal,
  EditorLauncher,
  guardDataFolder,
  guardGateFiles,
  guardOpenNote,
  pathOf,
  confirmArgs,
  editArgs,
  followSystemLanguage,
  layOut,
  notePath,
  PANE_PALETTE,
  readLinkVia,
  realPathVia,
  sayEdit,
  sayProposed,
  sayStopped,
  settingsFrom,
  viewOf,
  word,
} from './graph.js';

const PANE = 'graph';
const EDITOR_PANE = 'graph-editor';
const PROPOSE = 'mcp__thoughtknot__propose';
const PROPOSE_TOOL =
  'Propose changes to the graph of the note open in the ThoughtKnot editor. Nothing is applied: the changes wait on a card ' +
  'in the editor for the user to accept or reject. Each change is one of: {op: "add-thing", name, kind, properties?}, ' +
  '{op: "add-link", from, type, to}, {op: "set", thing, key, value}, {op: "remove-thing", thing}, ' +
  '{op: "remove-link", from, type, to}, each with an optional "reason". Names are one word. You cannot add a Person, ' +
  'a Model or a Step. "read" lists what you read, if you say so.';
const PROPOSE_SCHEMA = {
  type: 'object',
  properties: {
    changes: { type: 'array', items: { type: 'object', properties: { op: { type: 'string' } }, required: ['op'] } },
    read: { type: 'array', items: { type: 'string' } },
  },
  required: ['changes'],
};
const view = atom({ plugin: 'thoughtknot', key: 'view' } as const, null as GraphView | null);
// counts changes to the editor pane so it is drawn again; it holds no address, token or note
const editorChanges = atom({ plugin: 'thoughtknot', key: 'editor' } as const, 0);

/** The session's editor: made when first asked for, and kept for the module's life (its server dies with it). */
let launcher: EditorLauncher | null = null;

/** The mod's data folder (settings and drafts): `CLAUDE_PLUGIN_DATA`, else the plugins data folder under the config. */
async function dataFolderOf($: EngineInterface): Promise<{ data: string; home?: string }> {
  const home = await $.env.get('HOME');
  // an empty CLAUDE_PLUGIN_DATA is unset
  const data = (await $.env.get('CLAUDE_PLUGIN_DATA')) || `${home ?? ''}/.claude/plugins/data/thoughtknot`;
  return home ? { data, home } : { data };
}

/** The user's settings, saved as settings.json in the data folder; none, or one that cannot be read, is the defaults. */
async function settingsAt($: EngineInterface, data: string) {
  try {
    return settingsFrom(JSON.parse(await $.fs.read(`${data}/settings.json`)));
  } catch {
    return settingsFrom(null);
  }
}

/** The launcher over this host's calls; the server it runs is the mod's own bin/editor-server.mjs. */
async function launcherOf($: EngineInterface): Promise<EditorLauncher> {
  if (launcher) return launcher;
  const { data } = await dataFolderOf($);
  launcher = new EditorLauncher({
    spawn: (request) => $.process.spawn(request),
    // a matrix note is read only when its real path, links settled, is inside the vault: the mod's file calls do not
    // settle links, so node is asked
    realPath: realPathVia(
      (request) => $.process.spawn(request),
      ['node', `${$.plugin.root}/bin/real-path.mjs`],
      (ms, fn) => $.clock.after(ms, fn),
    ),
    exists: (path) => $.fs.exists(path),
    read: (path) => $.fs.read(path),
    // the user's settings, saved as settings.json in the plugin data folder; none, or one that cannot be read, is the
    // defaults, which are the strictest: Claude's ceiling the lowest, a note with no classification the highest
    settings: () => settingsAt($, data),
    after: (ms, fn) => $.clock.after(ms, fn),
    cwd: await $.session.cwd(),
    server: ['node', `${$.plugin.root}/bin/editor-server.mjs`],
    drafts: data,
    // Claude's proposals: a key made for each start, and the shipped sender (node), which is handed the request on its
    // standard input so the key is in no command line (cc_claude_proposes)
    key: () => {
      const bytes = new Uint8Array(32);
      globalThis.crypto.getRandomValues(bytes);
      return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    },
    propose: async (request) => {
      const ran = await $.process.run(['node', `${$.plugin.root}/bin/propose.mjs`], {
        stdin: JSON.stringify(request),
        timeoutMs: 30_000,
      });
      return JSON.parse(ran.stdout) as { status: number; text: string };
    },
    changed: () => void update($, editorChanges, (n) => n + 1).then(() => $.ui.invalidate('ui.render')),
  });
  return launcher;
}

/** The view of the note at `path`, or of why it could not be read. */
async function viewAt($: EngineInterface, path: string): Promise<GraphView> {
  let note: string;
  try {
    note = await $.fs.read(path);
  } catch (err) {
    const why = word('cc.could-not-read', { path, why: err instanceof Error ? err.message : String(err) });
    return { title: path, alt: why, lines: [why] };
  }
  const run = (argv: readonly string[], stdin: string, timeoutMs: number) => $.process.run(argv, { stdin, timeoutMs });
  // the drawing carries light and dark and follows the app's own appearance (PANE_PALETTE says why)
  return viewOf(note, (dots) => layOut(dots, $.plugin.root, run), PANE_PALETTE);
}

/**
 * Draws the note in the graph pane, as /graph does; the text it answers with. The pane is one Claude can read, so the
 * note is held to the same gate as the editor's (cc_classified_asks, cc_credential_never): one that may not open is not
 * drawn, and the answer says why, with no text of the note.
 */
async function drawNote($: EngineInterface, path: string): Promise<string> {
  const gate = await (await launcherOf($)).gate(path, await $.session.cwd());
  if ('refuse' in gate) return word('cc.refused-not-drawn', { why: gate.refuse });
  if ('ask' in gate) return word('cc.asks-not-drawn', { why: gate.ask, path });
  const shown = await viewAt($, path);
  await update($, view, () => shown);
  await $.ui.open({ id: PANE, title: word('cc.pane-title', { title: shown.title }) });
  return shown.why ? word('cc.shown-as-text', { alt: shown.alt, why: shown.why }) : shown.alt;
}

export const register: Register = (on) => {
  // the pane's words are said in the system's language (spec §42)
  followSystemLanguage();
  // Claude's own writes to the data folder are refused (spec §26): it could loosen its own gate. So are its writes to
  // the note open in the editor (cc_claude_proposes, risk AI-1): it changes that note only by the propose tool, which
  // the refusal names. So are its writes to the matrix note and to a classification line (risk TRUST-1). Every tool is
  // hooked, as the guards judge any tool whose input names a path, not only the ones listed (risk TRUST-2). A guard
  // that fails refuses too. Reads are not judged.
  on('tool.call', async ($, e, next) => {
    const tool = e.tool;
    const input = e as Record<string, unknown>;
    if (tool !== 'Bash' && pathOf(tool, input) === null) return next(e);
    const { data, home } = await dataFolderOf($);
    const ports = {
      ...(home ? { home } : {}),
      cwd: await $.session.cwd(),
      realPath: realPathVia(
        (request) => $.process.spawn(request),
        ['node', `${$.plugin.root}/bin/real-path.mjs`],
        (ms, fn) => $.clock.after(ms, fn),
      ),
      readLink: readLinkVia(
        (request) => $.process.spawn(request),
        ['node', `${$.plugin.root}/bin/real-path.mjs`],
        (ms, fn) => $.clock.after(ms, fn),
      ),
    };
    const refusal =
      (await guardDataFolder(tool, input, { data, ...ports })) ??
      (await guardOpenNote(tool, input, { note: launcher?.note ?? null, ...ports })) ??
      (await guardGateFiles(tool, input, {
        matrixNote: (await settingsAt($, data)).aiMatrixNote ?? null,
        read: (path) => $.fs.read(path),
        ...ports,
      }));
    return refusal === null ? next(e) : { deny: refusal };
  }).catch(($, e, next) => (next.called ? next(e) : { deny: dataFolderRefusal() }));

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'graph', description: word('cc.command') });
    // the one tool Claude has here: to propose changes to the note open in the editor. It writes nothing itself.
    await $.tool.register({
      name: 'propose',
      description: PROPOSE_TOOL,
      inputSchema: PROPOSE_SCHEMA,
      isDeferred: false,
    });
    return next(e);
  });

  // Claude proposes; the server makes the change set, and the user accepts or rejects it on the card (cc_claude_proposes)
  on('tool.call', { tool: PROPOSE }, async ($, e) => {
    const outcome = await (await launcherOf($)).propose({ changes: e.changes, read: e.read });
    return outcome.ok ? { result: sayProposed(outcome) } : { deny: sayProposed(outcome) };
  });

  on('command.run', { command: 'graph' }, async ($, e) => {
    if (e.args.trim() === 'stop') {
      const stopped = launcher ? await launcher.stop('/graph stop') : false;
      return { text: stopped ? sayStopped('/graph stop') : word('cc.editor.usage') };
    }
    const confirming = confirmArgs(e.args);
    const editing = editArgs(e.args);
    if (confirming || editing !== null) {
      // who ran the command, as the host says: only the composer is the person typing, and nothing else may say yes
      const origin = (e as { origin?: unknown }).origin;
      const opened = confirming
        ? await (await launcherOf($)).confirm(origin)
        : await (await launcherOf($)).edit(editing ?? '', await $.session.cwd(), origin);
      if (!opened.ok) {
        // the editor did not start: say why, and show the drawing /graph gives, unless the gate held the note back
        if (editing && !opened.held) await drawNote($, editing);
        return { text: sayEdit(opened) };
      }
      await update($, editorChanges, (n) => n + 1);
      await $.ui.open({ id: EDITOR_PANE, title: word('cc.editor.pane-title'), focus: true });
      return { text: sayEdit(opened) };
    }
    const path = notePath(e.args);
    if (!path) return { text: word('cc.usage') };
    return { text: await drawNote($, path) };
  });

  // the session ending ends its server
  on('session.end', async ($, e, next) => {
    await launcher?.stop(word('server.session-ended'));
    return next(e);
  });

  // the one place the address is read: to draw it for the person, and to copy it for them
  on('ui.render', { component: 'Pane', requestId: EDITOR_PANE }, async ($, e) => {
    const { Box, Text, Link, Button } = $.ui.resolve(e);
    await read($, editorChanges);
    const href = launcher?.link ?? null;
    if (href === null) {
      const ended = launcher?.ended;
      return <Text dimColor>{ended ? sayStopped(ended) : word('cc.editor.usage')}</Text>;
    }
    return (
      <Box flexDirection="column">
        <Text>{word('cc.editor.open-address')}</Text>
        <Link href={href} label={word('cc.editor.open-link')} />
        <Button label={word('cc.editor.copy')} onPress={(press) => $.ui.copy({ text: href, surface: press.surface })} />
        <Text dimColor>{word('cc.editor.secret')}</Text>
      </Box>
    );
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e);
    const { Box, Text } = elements;
    const shown = await read($, view);
    if (!shown) return <Text dimColor>{word('cc.usage')}</Text>;

    // the terminal draws no Svg (Image and Raster only), though `'Svg' in` its table holds: the text stands in there
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined;
    if (Svg && shown.svg) return <Svg source={shown.svg} alt={shown.alt} />;
    // never text with no reason: a graph that could be drawn says why it is text here
    const why = shown.why ?? (shown.svg ? word('cc.no-pictures') : undefined);
    return (
      <Box flexDirection="column">
        {why ? <Text color="warning">⚠ {why}</Text> : null}
        {shown.lines.map((line, i) => (
          <Text key={`line-${i}`}>{line}</Text>
        ))}
      </Box>
    );
  });
};
