// The words of the desktop app's own pages, in UK English (editor spec §41, standalone_app; §42, words_catalogue).
// The editor inside the app is the browser editor's page, which says its own words. source-words.ts keeps them with
// every other word.

/** The words of the desktop app, by key, in UK English. */
export const APP_SOURCE_WORDS = {
  'app.no-folder': 'Pick the folder your notes are in. The app reads and writes only inside it.',
  'app.open-folder': 'Open a folder of notes',
  'app.folder-notes': { one: '{folder}: {count} note', other: '{folder}: {count} notes' },
  'app.notes': { one: '{count} note', other: '{count} notes' },
  'app.no-notes': 'This folder has no notes yet. A note is a Markdown file, ending in .md.',
  'app.cannot-read': 'Could not open the folder: {why}',
  'app.back': 'All notes',
  'app.privacy': 'ThoughtKnot keeps no data about you. Its privacy page: {address}',
  'app.not-yet': 'This is not in the app yet. Open the note in Obsidian or the browser editor for it.',
} as const;
