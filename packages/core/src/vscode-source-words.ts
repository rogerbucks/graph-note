// The words of the VS Code extension's own messages, in UK English (editor spec §41, vscode_plugin; §42,
// words_catalogue). The editor in its tab is the browser editor's page, which says its own words. app-source-words.ts
// gathers them with the desktop app's.

/** The words of the VS Code extension, by key, in UK English. */
export const VSCODE_SOURCE_WORDS = {
  'vscode.open-a-note': 'Open a Markdown note first, then choose Open in ThoughtKnot.',
  'vscode.hidden-note': 'This note is in a hidden folder, such as .git. ThoughtKnot never opens notes there.',
  'vscode.tab': '{note} in ThoughtKnot',
  'vscode.ai.off': 'AI is off. Turn on ThoughtKnot: AI Use in the settings before anything is sent.',
  'vscode.ai.settings': 'Open the settings',
  'vscode.ai.no-models':
    'VS Code offers no language model yet. Sign in to one in VS Code, such as GitHub Copilot, then ask again.',
  'vscode.ai.model-name': '{name}, in VS Code',
  'vscode.ai.address': 'VS Code’s language model API, signed in by you',
  'vscode.ai.pick-model': 'Which of VS Code’s language models to ask',
  'vscode.ai.pick-graph': 'Which graph to send',
  'vscode.ai.pick-things': 'Tick the things to send',
  'vscode.ai.shown': 'What is sent to {model} is shown beside the note. Send exactly that, once?',
  'vscode.ai.why': 'ThoughtKnot sends the graph you chose, to propose changes to it.',
} as const;
