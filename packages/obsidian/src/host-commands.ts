// Obsidian's own commands, added through the plug-in interface as any plug-in's are (editor spec §43,
// plugin_interface). Each is a command of the built-in plug-in `thoughtknot.obsidian`. The registry gives it back to
// Obsidian's command list under the word it always had, so a key a person gave it stays theirs. A command offered only
// while a drawing is in use says so by `available`. A command that fails is named in a notice, never let through.
import { Notice } from 'obsidian';
import { PLUGIN_API, pluginRegistry, word } from '@thoughtknot/core';
import type { PluginCommand, PluginRegistry, ThoughtKnotPlugin as CorePlugin } from '@thoughtknot/core';
import { AI_COMMAND, CLEAR_SENDS_COMMAND, askAi, clearAiSends } from './ai/ai';
import { IMPORT_COMMAND, importFromDatabase } from './databases/import';
import { RECOVER_COMMAND, recoverDrafts } from './drafts';
import { tourCommand } from './first-run';
import { shortcutCommands } from './shortcuts';
import type ThoughtKnotPlugin from './main';

/** The id of the built-in plug-in whose commands are Obsidian's own. */
export const OBSIDIAN_COMMANDS_ID = 'thoughtknot.obsidian';

/** A command of Obsidian's own: its id is the word Obsidian knows it by, which the plug-in's id goes before in the registry. */
export type HostCommand = PluginCommand;

/** Every command of the plugin, by the word Obsidian knows each by. */
export function hostCommands(plugin: ThoughtKnotPlugin): HostCommand[] {
  return [
    { id: 'convert-to-standard', title: word('host.command.convert'), run: () => plugin.convertToStandard() },
    { id: RECOVER_COMMAND.id, title: RECOVER_COMMAND.name, run: () => recoverDrafts(plugin) },
    tourCommand(),
    ...shortcutCommands(plugin.app),
    { id: AI_COMMAND.id, title: AI_COMMAND.name, run: () => askAi(plugin) },
    { id: CLEAR_SENDS_COMMAND.id, title: CLEAR_SENDS_COMMAND.name, run: () => clearAiSends(plugin) },
    { id: IMPORT_COMMAND.id, title: IMPORT_COMMAND.name, run: () => importFromDatabase(plugin) },
  ];
}

/** The built-in plug-in whose commands are Obsidian's own. */
export function obsidianCommands(plugin: ThoughtKnotPlugin): CorePlugin {
  return {
    id: OBSIDIAN_COMMANDS_ID,
    version: '1.0.0',
    api: PLUGIN_API,
    uses: ['commands'],
    register: (points) => {
      for (const c of hostCommands(plugin)) points.commands?.add({ ...c, id: `${OBSIDIAN_COMMANDS_ID}.${c.id}` });
    },
  };
}

/** Obsidian's command list, from the registry's commands: each under the word it had before, offered as it says. */
export function offerCommands(plugin: ThoughtKnotPlugin, registry: PluginRegistry): void {
  const word = (id: string) => id.slice(OBSIDIAN_COMMANDS_ID.length + 1);
  const run = async (id: string) => {
    const r = await registry.runCommandAsync(id);
    if (!r.ok) new Notice(r.message);
  };
  for (const c of registry.commands()) {
    if (!c.id.startsWith(`${OBSIDIAN_COMMANDS_ID}.`)) continue;
    if (c.available)
      plugin.addCommand({
        id: word(c.id),
        name: c.title,
        checkCallback: (checking: boolean) => {
          if (!registry.commandOffered(c.id)) return false;
          if (!checking) void run(c.id);
          return true;
        },
      });
    else plugin.addCommand({ id: word(c.id), name: c.title, callback: () => run(c.id) });
  }
}

/** Adds the plugin's commands, all through the plug-in interface. */
export function addCommands(plugin: ThoughtKnotPlugin): void {
  const registry = pluginRegistry({ timeLimit: Infinity });
  registry.register(obsidianCommands(plugin));
  offerCommands(plugin, registry);
}
