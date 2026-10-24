// The VS Code extension's own commands, added through the plug-in interface as any plug-in's are (editor spec §43,
// plugin_interface). Each is a command of the built-in plug-in `thoughtknot.vscode`. The registry gives it back to VS
// Code under the id it always had, which menus and keys name. A command that fails is named in a message.
import * as vscode from 'vscode';
import { PLUGIN_API, pluginRegistry } from '../../core/src/plugins.ts';
import type { PluginCommand, PluginRegistry, ThoughtKnotPlugin } from '../../core/src/plugins.ts';

/** The id of the built-in plug-in whose commands are the extension's own. */
export const VSCODE_COMMANDS_ID = 'thoughtknot.vscode';

/** What each command is called in the registry, and the id VS Code knows it by (package.json). */
export const VSCODE_IDS: Readonly<Record<string, string>> = Object.freeze({
  'open-graph': 'thoughtknot.openGraph',
  'ask-ai': 'thoughtknot.askAi',
});

/** The built-in plug-in whose commands are the extension's own, each run on what VS Code gave it. */
export function vscodeCommands(commands: Readonly<Record<string, Omit<PluginCommand, 'id'>>>): ThoughtKnotPlugin {
  return {
    id: VSCODE_COMMANDS_ID,
    version: '1.0.0',
    api: PLUGIN_API,
    uses: ['commands'],
    register: (points) => {
      for (const [name, command] of Object.entries(commands))
        points.commands?.add({ ...command, id: `${VSCODE_COMMANDS_ID}.${name}` });
    },
  };
}

/** The commands the registry holds, given to VS Code under their ids; the disposables to keep. */
export function offerCommands(registry: PluginRegistry): vscode.Disposable[] {
  return registry.commands().flatMap((c) => {
    const id = VSCODE_IDS[c.id.slice(VSCODE_COMMANDS_ID.length + 1)];
    if (!id) return [];
    return [
      vscode.commands.registerCommand(id, async (given?: unknown) => {
        const r = await registry.runCommandAsync(c.id, given);
        if (!r.ok) void vscode.window.showErrorMessage(r.message);
      }),
    ];
  });
}

/** Adds the extension's commands, all through the plug-in interface; the disposables to keep. */
export function addCommands(commands: Readonly<Record<string, Omit<PluginCommand, 'id'>>>): vscode.Disposable[] {
  const registry = pluginRegistry({ timeLimit: Infinity });
  registry.register(vscodeCommands(commands));
  return offerCommands(registry);
}
