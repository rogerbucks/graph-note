// The strings kept in the rest of the core's code, by file, each with why (editor spec §42, words_catalogue). They
// are never said to a person in their language. Some are the catalogue's own UK English, and some a developer's
// contract or error. Others are the bytes of a file, a note or a change set (locale_never_changes_bytes). The settings'
// words are kept beside the catalogue's. words-in-code-areas.js adds these to its own.
import { readdirSync } from 'node:fs';

const SRC = new URL('../src/', import.meta.url);

/** The catalogue's own files: the UK English every word is said from, which a translation gives again. */
const CATALOGUE = Object.fromEntries(
  readdirSync(SRC)
    .filter((f) => f.endsWith('source-words.ts'))
    .map((f) => [`packages/core/src/${f}`, '*']),
);

/** The strings kept in the rest of the core, by file, each with why. `*` keeps every string of the file. */
export const CORE_KEPT = {
  ...CATALOGUE,
  // the settings in UK English, held equal to their catalogue words by settings-words.test.js, which says them
  'packages/core/src/settings.ts': '*',
  'packages/core/src/settings-aids.ts': '*',
  'packages/core/src/settings-matrix.ts': '*',
  'packages/core/src/settings-language.ts': '*',
  // what each open number governs, for a developer reading the register: no host shows it
  'packages/core/src/thresholds.ts': '*',
  // what each design token is for, and why a plug-in's token is refused: for a theme's or a plug-in's developer
  'packages/core/src/theme-tokens.ts': '*',
  // the contract suites a plug-in's or a backend's developer runs: their test cases and what each wanted
  'packages/core/src/plugins-contract.ts': '*',
  'packages/core/src/storage-contract.ts': '*',
  // why an extension point refuses what a plug-in adds, or its manifest, or its file: told to its developer
  'packages/core/src/plugin-points.ts': '*',
  'packages/core/src/plugin-versions.ts': '*',
  'packages/core/src/plugin-outside.ts': '*',
  // what the worker that serves a plug-in answers over its port: a fault of the plug-in's code, for its developer
  'packages/core/src/plugin-serve.ts': '*',
  // the WCAG constraints as graph text: a note's bytes, never said to a person (editor spec §36)
  'packages/core/src/accessibility-lens.ts': '*',
  // what an SVG holds beyond a picture, named for a developer's test (editor spec §36, drawing_holds_no_state)
  'packages/core/src/drawing-commands.ts': ['form field'],
  // why a theme chain is refused: a fault of the theme graph, for its author's developer (editor spec §36)
  'packages/core/src/theme-graph.ts': '*',
  // why a translation is not added, told to its translator, never to a person using the app
  'packages/core/src/words.ts': '*',
  // why a plug-in is not installed, told to its developer as the registry refuses it
  'packages/core/src/plugins.ts': [
    'it asks for host abilities this host does not offer: {}',
    'The plug-in {} was not installed: {}.',
    '(no id)',
    'its id must be dotted lower-case words, such as acme.mermaid-export',
    'a plug-in with that id is installed already',
    'its version "{}" is not major.minor.patch',
    'its manifest names host abilities that do not exist: {}',
    'the theme token {} is already added by {}',
    'it failed while registering: {}',
  ],
  // why a diagram type is refused, and what is wrong with the marks it gave back: faults of its code, for its developer
  'packages/core/src/plugin-diagrams.ts': [
    'the diagram type "{}" is not named {}.<word>',
    'the diagram type "{}" is added already',
    'the diagram type "{}" has no title on one line',
    'the diagram type "{}" draws nothing',
    'a mark that is not an object',
    'a mark whose thing is not a short text',
    'a box outside the space it was given',
    'a box whose label is not text of {} characters or fewer',
    'a line that is not two or more points in the space',
    'a piece of text outside the space it was given',
    'a piece of text that is not text of {} characters or fewer',
    'a mark of the kind {}, which is not a box, a line or text',
    'it gave back no list of marks',
    'it gave back {} marks, over the {} allowed',
    'mark {} is {}',
  ],
  // what is wrong with the drawing marks a diagram type gave back: faults of its code, for its developer
  'packages/core/src/drawing-marks.ts': '*',
  // why an AI provider is refused as it is added, told to its developer
  'packages/core/src/plugin-ai.ts': [
    'the AI provider "{}" is not named by a lower-case word',
    'the AI provider "{}" is already added by {}',
    'the AI provider "{}" has no title',
    'the AI provider "{}" shapes no request',
    'the AI provider "{}" reads no reply',
    'the AI provider "{}" cannot put the key in the header "{}"',
    'the AI provider "{}" writes the key with {key} once, on one line',
  ],
  // why a plug-in run apart did not start or register, and the answer to an ability it was not given: for its developer
  'packages/core/src/plugin-isolated.ts': [
    'the host ability {} was not given',
    'it did not start within the {} ms allowed',
    'The plug-in did not start within the {} ms allowed.',
    "The plug-in's worker failed: {}",
    'it could not register: {}',
    'The plug-in could not register: {}.',
    'it adds to {}, which its manifest does not name',
    'a plug-in run apart cannot add to {} yet',
  ],
  // a marker compared to tell a graph with no text apart: its words are said from the catalogue
  'packages/core/src/plugin-sources.ts': ['it gave no graph text'],
  // why a write a plug-in asks for waits, given back to the plug-in, never to a person
  'packages/core/src/plugin-files.ts': ['the change waits for the person to accept it'],
  // why a backend refuses a write, compared by the contract suite, and a developer's error
  'packages/core/src/note-storage.ts': [
    'the note has changed since it was read',
    'a note is already at that path',
    'no note is at that path',
    "not a note's path in the store: {}",
  ],
  // a layout's failure as an error's message, for a developer: a host says it from the catalogue by its stage
  'packages/core/src/layout-worker.ts': [
    'the layout worker failed: {}',
    'the layout engine could not start: {}',
    'the layout engine took too long to start',
  ],
  // a developer's errors, for a palette, a theme or a drawing the code itself got wrong
  'packages/core/src/palette.ts': ['the theme has no {}', 'the style blends at {} only, not {}', ' and '],
  'packages/core/src/theme.ts': ['nothing was laid out'],
  'packages/core/src/export-frame.ts': [
    'an export needs a fixed palette, one that paints its own page',
    'the drawing is not an SVG',
  ],
  'packages/core/src/export.ts': [
    'the image still has a theme variable in its colours, so it would not read the same outside Obsidian',
  ],
  'packages/core/src/export-data-model.ts': ['{} is not a value a note can hold, so it cannot be exported'],
  'packages/core/src/export-data.ts': ['{} is not a format the data is exported in: {}'],
  // what an export writes into its file or companion note: its bytes, never translated
  'packages/core/src/export-note.ts': '*',
  'packages/core/src/export-data-gql.ts': '*',
  'packages/core/src/export-data-csv.ts': ['faded thing', 'faded link'],
  'packages/core/src/export-data-graphml.ts': ['view {} of graph {}', 'Exported from {}, {}, {}'],
  // the style sheets that move an exported image and show its still frame: CSS in the file's bytes, never words
  'packages/core/src/export-motion.ts': '*',
  'packages/core/src/export-pictures.ts': [
    '{} { display: none; }',
    '@media (prefers-reduced-motion: reduce) { {} { display: none; } ',
    '{} { display: inline; } }',
  ],
  // what a model's answer records as read, written into the change set: its bytes, never translated
  'packages/core/src/ai-answer.ts': ['sent {} to {}'],
  // the standard schema, written into a note as GQL, and the words GQL keeps for itself
  'packages/core/src/standard-schemas.ts': '*',
  'packages/core/src/name-suggestions.ts': '*',
  // a CSS media query asking whether the screen is touched, never shown to a person
  'packages/core/src/display/graph-view/space-view-panel.ts': ['(pointer: coarse)'],
  // the ready-made lenses' saved queries and the Lens line written into a note: graph text, never translated. Also
  // the refusals a host's developer meets when a lens cannot be saved
  'packages/core/src/lens-library.ts': '*',
  // why a phase part refuses a transition that starts elsewhere: a developer's contract error
  'packages/core/src/phase-altitude.ts': '*',
};
