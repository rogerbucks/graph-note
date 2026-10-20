// The commands that ask an AI model or read a database (spec §19, §20). Nothing is sent to an AI model unless the user
// opens the send dialog, chooses, sees exactly what goes and presses Send. Nothing is read from a database file unless
// the user opens the import dialog and presses Import. The record of sends can be cleared. The commands of the keyboard
// shortcuts (§44) are added with them.
import { AI_COMMAND, CLEAR_SENDS_COMMAND, askAi, clearAiSends } from './ai/ai';
import { IMPORT_COMMAND, importFromDatabase } from './databases/import';
import { addShortcutCommands } from './shortcuts';
import type ThoughtKnotPlugin from './main';

export { SENDS_KEPT } from './ai/ai';
export { sqliteQuery } from './databases/sqlite';

/** Adds the commands that ask an AI model, clear the record of sends, and import from a database. */
export function addAskCommands(plugin: ThoughtKnotPlugin): void {
  plugin.addCommand({ ...AI_COMMAND, callback: () => askAi(plugin) });
  plugin.addCommand({ ...CLEAR_SENDS_COMMAND, callback: () => clearAiSends(plugin) });
  plugin.addCommand({ ...IMPORT_COMMAND, callback: () => importFromDatabase(plugin) });
}

/** Adds the plugin's commands: those of the keyboard shortcuts, then those that ask an AI model or read a database. */
export function addCommands(plugin: ThoughtKnotPlugin): void {
  addShortcutCommands(plugin);
  addAskCommands(plugin);
}
