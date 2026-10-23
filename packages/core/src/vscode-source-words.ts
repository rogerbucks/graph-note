// The words of the VS Code extension's own messages, in UK English (editor spec §41, vscode_plugin; §42,
// words_catalogue). The editor in its tab is the browser editor's page, which says its own words. app-source-words.ts
// gathers them with the desktop app's.

/** The words of the VS Code extension, by key, in UK English. */
export const VSCODE_SOURCE_WORDS = {
  'vscode.open-a-note': 'Open a Markdown note first, then choose Open in ThoughtKnot.',
  'vscode.hidden-note': 'This note is in a hidden folder, such as .git. ThoughtKnot never opens notes there.',
  'vscode.tab': '{note} in ThoughtKnot',
} as const;
