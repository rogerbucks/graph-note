// The words of the process debugger, in UK English (editor spec §42, words_catalogue; §35, process_debugger). They are
// said in a drawing's walk strip while a test run of a process is stepped. views-source-words.ts keeps them with the
// view words.

/** The process debugger's words, by key, in UK English. */
export const PROCESS_SOURCE_WORDS = {
  'debug.start': 'Debug {process}',
  'debug.play': 'Play',
  'debug.pause': 'Pause',
  'debug.back': 'Step back',
  'debug.forward': 'Step forward',
  'debug.stop': 'Stop debugging',
  'debug.panel': 'Test run',
  'debug.at': 'Step {step}: in {states}',
  'debug.start-at': 'Start: in {states}',
  'debug.guard-holds': '✓ {guard} holds',
  'debug.guard-fails': '✗ {guard} does not hold',
  'debug.guard-refused': '✗ {guard} could not be read: {why}',
  'debug.artefacts': 'Artefacts: {names}',
  'debug.resources': 'Resources: {names}',
  'debug.certainty': '{thing} would go from {from} to {to} (not applied: a test run leaves certainty as it is)',
  'debug.certainty-applied': '{thing} went from {from} to {to}',
  'debug.no-certainty': 'none',
  'debug.stubbed': 'Side effect stubbed: {effect}',
  'debug.breakpoint': 'Stopped at breakpoint {name}',
  'debug.ended': 'The run has ended: no transition can be taken.',
  'debug.test-run': 'This is a test run: it is thrown away when it stops.',
} as const;
