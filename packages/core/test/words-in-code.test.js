// No words the person reads are written in the code of the areas done so far (editor spec §42, words_catalogue). Those
// areas are the hosts, the display layer and the core's reading problems. Each is added as its words move. Each word
// comes from the catalogue by key, so a translation reaches it. The check reads every string the code holds. It
// flags any that reads as words. That is two plain words with a space, or a word that starts a control's text, name
// or hint.
// The few kept in the code are listed, each with why.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';

const ROOT = new URL('../../../', import.meta.url);

/** The folders and files whose words come from the catalogue, from the repository's root. */
const AREAS = [
  'packages/core/src/display/',
  'packages/core/src/export-write.ts',
  'packages/obsidian/src/',
  'packages/claude-code/page/',
  'packages/claude-code/src/',
  'packages/claude-code/server/',
  'packages/claude-code/bin/',
  'packages/claude-code/mod/hooks/register.tsx',
  // the core's problems found while reading a note
  'packages/core/src/partial-read.ts',
  'packages/core/src/estimates.ts',
  'packages/core/src/help.ts',
  'packages/core/src/name-gaps.ts',
  'packages/core/src/notes.ts',
  'packages/core/src/links.ts',
  'packages/core/src/blocks.ts',
  'packages/core/src/schema-checks.ts',
  'packages/core/src/schema-names.ts',
  'packages/core/src/sources.ts',
  'packages/core/src/strictness.ts',
  'packages/core/src/suggested-names.ts',
  'packages/core/src/image-links.ts',
  'packages/core/src/schema-picture.ts',
];

/** The files of the areas, as paths from the repository's root. */
const files = () =>
  AREAS.flatMap((a) =>
    a.endsWith('/')
      ? readdirSync(new URL(a, ROOT), { recursive: true })
          .map((f) => `${a}${String(f).replaceAll('\\', '/')}`)
          .filter((f) => /\.tsx?$/.test(f))
      : [a],
  );

/** The strings kept in the code, by file, each with why. `*` keeps every string of the file. */
const KEPT = {
  // the contract suites a host or a plug-in's developer runs: their test cases and what each says it wanted
  'packages/core/src/display/host-contract.ts': '*',
  'packages/core/src/display/panel-contract.ts': '*',
  // said to a developer who forgot to install a host, never to a person using the app
  'packages/core/src/display/host.ts': ['The display layer has no host: install one with installHost before drawing.'],
  // a reason kept to compare with, never shown: each host says a deleted note in its own words (kept-draft.ts)
  'packages/core/src/display/editor/editor-note.ts': ['the note was deleted'],
  // the fields a person types in, as a selector kept in a constant
  'packages/obsidian/src/live-preview.ts': ['input, textarea, select, [contenteditable="true"]'],
  // the note the drafts are recovered into: words written into a note are its bytes, never translated
  'packages/obsidian/src/drafts.ts': [
    '\n## {}, graph {}\n\nKept {}, as draft {}.\n\n{}\n{}\n{}',
    'What was typed in a graph and could not be written, as ThoughtKnot kept it.',
    '# Kept drafts\n\n{}\n{}\n',
  ],
  // compared with the purpose a person typed for each model in the settings, never shown
  'packages/obsidian/src/ai/send-dialog.ts': ['Proposing changes'],
  // said once in the console, for a developer
  'packages/obsidian/src/layout-worker/layout-worker.ts': '*',
  // said to a developer whose card option cannot be made read-only, in the console
  'packages/core/src/display/graph-view/read-only.ts': '*',
  // a colour the code asks the browser whether it can mix, never shown
  'packages/core/src/display/graph-view/drawing-svg.ts': ['color-mix(in srgb, red 50%, blue)'],
  // the elements that can take the focus, as a selector kept in a constant
  'packages/core/src/display/graph-view/full-screen.ts': ['a[href], button, input, select, textarea, [tabindex]'],
  'packages/claude-code/page/keyboard.ts': ['a[href], button, input, select, textarea, [tabindex]'],
  // what the mod tells Claude alone: a hook's refusal and a tool's result, which no person reads in the pane
  'packages/claude-code/src/data-guard.ts': '*',
  'packages/claude-code/src/gate-guard.ts': '*',
  'packages/claude-code/src/editor-propose.ts': '*',
  // a process's errors, never shown: each caller says why in its own words (editor-matrix.ts, data-guard.ts)
  'packages/claude-code/src/editor-realpath.ts': '*',
  // what the editor server tells Claude alone: the answers to Claude's propose tool and the key it proposes with
  'packages/claude-code/server/editor-proposals.ts': '*',
  'packages/claude-code/bin/propose-process.ts': '*',
  'packages/claude-code/server/editor-store.ts': ['This key proposes changes and does nothing else.'],
  // refusals of a request the editor's own page never makes, so no person reads them, and a developer's error
  'packages/claude-code/server/request-guard.ts': '*',
  'packages/claude-code/server/start-server.ts': [
    '<body><p>The ThoughtKnot editor is not here yet.</p></body></html>\n',
    'HTTP/1.1 {} {}\r\n{}content-length: 0\r\nconnection: close\r\n\r\n',
    'The editor server takes no {}: it listens on 127.0.0.1, on a port the system chooses.',
    'This server answers only its own address.',
    'This server answers no request from another origin.',
    'This server takes nothing in the address after its path, and never a token.',
    'This server takes only GET and PUT.',
  ],
  // the lines the server writes for the mod, which reads them by their start (editor-launch.ts)
  'packages/claude-code/server/editor-process.ts': ['editor server: {}\n', 'editor server stopped: {}\n'],
  'packages/claude-code/server/editor-server.ts': ['editor server: {}\n'],
  // the propose tool's description, which only Claude reads
  'packages/claude-code/mod/hooks/register.tsx': [
    'Propose changes to the graph of the note open in the ThoughtKnot editor. Nothing is applied: the changes wait on a card ',
    'in the editor for the user to accept or reject. Each change is one of: {op: "add-thing", name, kind, properties?}, ',
    '{op: "add-link", from, type, to}, {op: "set", thing, key, value}, {op: "remove-thing", thing}, ',
    '{op: "remove-link", from, type, to}, each with an optional "reason". Names are one word. You cannot add a Person, ',
    'a Model or a Step. "read" lists what you read, if you say so.',
  ],
  // the departures in UK English, held equal to their settings words by settings-words.test.js
  'packages/core/src/strictness.ts': [
    'A missing comma',
    'A pattern may end its line without the comma standard GQL needs before the next one.',
    'A comma with nothing after it',
    'The last pattern of a block may end with a comma, as while the next one is being typed.',
    'A link type without its colon',
    'A link may name its type without the colon, such as [KNOWS], when the graph has one type of that name.',
  ],
  // the schema's picture is GQL, written as the graph's own text
  'packages/core/src/schema-picture.ts': ["({}:Meta:ElementType {name: {}, kind: {}, origin: 'source'{}})"],
  // a marker the note's writer throws and catches again, never shown
  'packages/claude-code/server/note-file.ts': ['folder moved'],
};

/** The calls whose strings pick elements of the page, never words: `querySelector('a, b')` and the like. */
const PICKS = /^(?:querySelector|querySelectorAll|closest|matches|createElementNS|setAttributeNS)$/;

/** The properties and calls whose single word a person reads: a control's text, its name or its hint. */
const SHOWN = /^(?:text|title|placeholder|aria-label|say|setText|button)$/;

/** Whether `text` reads as words: two plain words with a space between, as a sentence or a label has. */
const readsAsWords = (text) =>
  text.split(/\s+/).filter((w) => /^[(\[⚠✖]?[A-Za-z][a-z]+[,.:;…?!)]?$/.test(w)).length >= 2;

/** Whether `node` is given to the console, which only a developer reads: `console.error('…', e)`. */
const toConsole = (node) =>
  ts.isCallExpression(node.parent) &&
  ts.isPropertyAccessExpression(node.parent.expression) &&
  node.parent.expression.expression.getText() === 'console';

/** The name of the property or call a string is given to, if any. */
function givenTo(node) {
  const p = node.parent;
  if (ts.isPropertyAssignment(p) && p.initializer === node) return p.name.getText().replace(/['"]/g, '');
  if (ts.isCallExpression(p)) {
    const callee = p.expression;
    return ts.isPropertyAccessExpression(callee) ? callee.name.text : callee.getText();
  }
  return '';
}

/** The strings in `source` a person would read, with the `${…}` of a template left out; `name` says if it is TSX. */
function wordsIn(source, name = 'x.ts') {
  const kind = name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const visit = (node) => {
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isJsxText(node) && node.text.trim()) text = node.text.trim();
    else if (ts.isTemplateExpression(node))
      text = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('{}');
    if (text !== null) {
      const to = givenTo(node);
      const imported = ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent);
      if (!imported && !PICKS.test(to) && !toConsole(node)) {
        const plain = text.replace(/\{\}/g, ' ');
        if (readsAsWords(plain) || (SHOWN.test(to) && /^[A-Z][a-z]+\b/.test(plain.trim()))) found.push(text);
      }
      if (!ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('the words in the code', () => {
  test('the check finds a sentence, a label and a control’s one word, and passes classes, keys, selectors and the console', () => {
    const source = [
      "el.createEl('p', { cls: 'thoughtknot-quiet metadata-input', text: 'No problems.' });",
      'say(`Line ${n}: ${message}`);',
      "button('Cancel', run);",
      "el.querySelectorAll('button, label, option');",
      "if (e.key === 'Enter') go();",
      "import { word } from '@thoughtknot/core';",
      "el.setText(word('find.none'));",
      "console.error('ThoughtKnot could not draw', graph, e);",
    ].join('\n');
    assert.deepEqual(wordsIn(source), ['No problems.', 'Line {}: {}', 'Cancel']);
  });

  test('the check finds the words written between the tags of a TSX file', () => {
    const source = 'const pane = <Box><Text>Open this address:</Text><Text>{why}</Text></Box>;';
    assert.deepEqual(wordsIn(source, 'pane.tsx'), ['Open this address:']);
  });

  // proves: words_catalogue
  test('every word a person reads comes from the catalogue, but those kept in the code with why', () => {
    const found = files().flatMap((f) => {
      const kept = KEPT[f] ?? [];
      return wordsIn(readFileSync(new URL(f, ROOT), 'utf8'), f)
        .filter((w) => kept !== '*' && !kept.includes(w))
        .map((w) => `${f}: ${w}`);
    });
    assert.deepEqual(found, [], 'say each by a key of source-words.ts, with word()');
  });
});
