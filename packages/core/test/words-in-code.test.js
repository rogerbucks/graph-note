// No words the person reads are written in the code of the areas done so far (editor spec §42, words_catalogue). The
// areas are the display layer and parts of the Obsidian host; each is added as its words move. Each word comes from
// the catalogue by key, so a translation reaches it. The check reads every string the code holds. It
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
  'packages/obsidian/src/export/',
  'packages/obsidian/src/images/',
  'packages/obsidian/src/links/',
  'packages/obsidian/src/proposals/',
  'packages/obsidian/src/sources/',
  'packages/obsidian/src/block.ts',
  'packages/obsidian/src/view-block.ts',
  'packages/obsidian/src/reading-view.ts',
  'packages/obsidian/src/inline-editors.ts',
  'packages/obsidian/src/step-block.ts',
  'packages/obsidian/src/schema-block.ts',
  'packages/obsidian/src/live-preview.ts',
];

/** The files of the areas, as paths from the repository's root. */
const files = () =>
  AREAS.flatMap((a) =>
    a.endsWith('/')
      ? readdirSync(new URL(a, ROOT), { recursive: true })
          .map((f) => `${a}${String(f).replaceAll('\\', '/')}`)
          .filter((f) => f.endsWith('.ts'))
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
  // said to a developer whose card option cannot be made read-only, in the console
  'packages/core/src/display/graph-view/read-only.ts': '*',
  // a colour the code asks the browser whether it can mix, never shown
  'packages/core/src/display/graph-view/drawing-svg.ts': ['color-mix(in srgb, red 50%, blue)'],
  // the elements that can take the focus, as a selector kept in a constant
  'packages/core/src/display/graph-view/full-screen.ts': ['a[href], button, input, select, textarea, [tabindex]'],
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

/** The strings in `source` a person would read, with the `${…}` of a template left out. */
function wordsIn(source) {
  const file = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = (node) => {
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
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

  // proves: words_catalogue
  test('every word a person reads comes from the catalogue, but those kept in the code with why', () => {
    const found = files().flatMap((f) => {
      const kept = KEPT[f] ?? [];
      return wordsIn(readFileSync(new URL(f, ROOT), 'utf8'))
        .filter((w) => kept !== '*' && !kept.includes(w))
        .map((w) => `${f}: ${w}`);
    });
    assert.deepEqual(found, [], 'say each by a key of source-words.ts, with word()');
  });
});
