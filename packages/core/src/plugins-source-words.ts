// What the plug-ins' calls say when one fails, in UK English (editor spec §42, words_catalogue, and §43). They say
// that nothing adds what was asked for, or that a call failed, ran too long or gave back nothing it could use. Each
// names the plug-in, so the person knows whose it was. What a plug-in's developer is told about a manifest or what it
// adds stays in the code: no person reads it. source-words.ts keeps these with every other word.

/** The words of the plug-ins' calls, by key, in UK English. */
export const PLUGINS_SOURCE_WORDS = {
  // nothing adds what was asked for (plugins.ts)
  'plugins.none.format': 'No plug-in adds the format "{name}".',
  'plugins.none.storage': 'No plug-in adds the storage "{name}".',
  'plugins.none.command': 'No plug-in adds the command "{name}".',
  'plugins.none.panel': 'No plug-in adds the panel "{name}".',
  'plugins.none.source': 'No plug-in adds the source "{name}".',
  'plugins.none.step': 'No plug-in adds the step "{name}".',
  'plugins.none.diagram': 'No plug-in adds the diagram type "{name}".',
  'plugins.none.provider': 'No plug-in adds the AI provider "{name}".',
  // what was called, by its title, as the sentences below name it
  'plugins.what.export': 'The export {title}',
  'plugins.what.storage': 'The storage {title}',
  'plugins.what.command': 'The command {title}',
  'plugins.what.panel': 'The panel {title}',
  'plugins.what.source': 'The source {title}',
  'plugins.what.step': 'The step {title}',
  'plugins.what.diagram': 'The diagram type {title}',
  'plugins.what.provider': 'The AI provider {title}',
  // a call that failed, ran too long or was not run (plugin-calls.ts)
  'plugins.not-run': '{what} of {plugin} was not run: {why}',
  'plugins.failed': '{what} of {plugin} failed: {why}',
  'plugins.stopped-slow': 'the plug-in was stopped, as {what} took {ms} ms, over the {most} ms allowed',
  'plugins.too-long': '{what} of {plugin} ran too long: {why}.',
  // what a call gave back that cannot be used (plugins.ts, plugin-sources.ts, plugin-diagrams.ts, plugin-ai.ts)
  'plugins.export-no-text': 'The export {title} of {plugin} gave no text.',
  'plugins.graph.bytes': 'it is {size} bytes, over the {most} a graph may be',
  'plugins.graph.lines': 'it is {size} lines, over the {most} a graph may be',
  'plugins.graph.no-text': '{what} of {plugin} gave no graph text.',
  'plugins.graph.refused': '{what} of {plugin} was refused: {why}.',
  'plugins.diagram.no-space': '{what} of {plugin} was not drawn: the space has no width and height.',
  'plugins.diagram.not-drawn': '{what} of {plugin} was not drawn: {why}.',
  'plugins.provider.no-request': '{what} of {plugin} gave no request text.',
  'plugins.provider.no-answer': '{what} of {plugin} read no answer from the reply.',
  // a plug-in run apart, in a worker, and stopped (plugin-isolated.ts)
  'plugins.isolated.by-host': 'it was stopped by the host',
  'plugins.isolated.stopped': 'the plug-in was stopped, as {why}',
  'plugins.isolated.slow-call': 'a call ran over the {most} ms allowed',
  'plugins.isolated.worker-failed': 'its worker failed: {why}',
  // the core's own storage, by its title (core-storage.ts)
  'plugins.storage.memory': 'In memory',
  // the core's own AI provider, by its title (core-ai.ts)
  'plugins.ai.chat-completions': 'Chat completions',
  // the host's own graph sources, by their titles (host-sources.ts)
  'plugins.source.file': 'Graph file',
  'plugins.source.note': 'Note',
  'plugins.source.unread': 'Nothing could be read at "{target}".',
} as const;
