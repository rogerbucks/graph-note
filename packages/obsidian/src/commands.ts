// The commands of the plugin (spec §19, §20, §44). Nothing is sent to an AI model unless the user opens the send dialog,
// chooses, sees exactly what goes and presses Send. Nothing is read from a database file unless the user opens the
// import dialog and presses Import. The record of sends can be cleared. They are all added through the plug-in interface
// (host-commands.ts).
export { addCommands } from './host-commands';
export { SENDS_KEPT } from './ai/ai';
export { sqliteQuery } from './databases/sqlite';
