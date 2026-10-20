// No words the person reads are written in the display layer's code (editor spec §42, words_catalogue). Each comes
// from the catalogue by key, so a translation reaches it. The check reads every string the layer's code holds. It
// flags any that reads as words: two plain words with a space, or a word that starts what a control shows as its text, name or hint.
// The few kept in the code are listed, each with why.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';

const DISPLAY = new URL('../src/display/', import.meta.url);

/** The files of the display layer, as paths from its folder. */
const files = () =>
  readdirSync(DISPLAY, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.ts'));

/** The strings kept in the code, by file, each with why. `*` keeps every string of the file. */
const KEPT = {
  // the contract suites a host or a plug-in's developer runs: their test cases and what each says it wanted
  'host-contract.ts': '*',
  'panel-contract.ts': '*',
  // said to a developer who forgot to install a host, never to a person using the app
  'host.ts': ['The display layer has no host: install one with installHost before drawing.'],
  // said to a developer whose card option cannot be made read-only, in the console
  'graph-view/read-only.ts': '*',
  // a colour the code asks the browser whether it can mix, never shown
  'graph-view/drawing-svg.ts': ['color-mix(in srgb, red 50%, blue)'],
  // the elements that can take the focus, as a selector kept in a constant
  'graph-view/full-screen.ts': ['a[href], button, input, select, textarea, [tabindex]'],
};

/** The calls whose strings pick elements of the page, never words: `querySelector('a, b')` and the like. */
const PICKS = /^(?:querySelector|querySelectorAll|closest|matches|createElementNS|setAttributeNS)$/;

/** The properties and calls whose single word a person reads: a control's text, its name or its hint. */
const SHOWN = /^(?:text|title|placeholder|aria-label|say|setText|button)$/;

/** Whether `text` reads as words: two plain words with a space between, as a sentence or a label has. */
const readsAsWords = (text) =>
  text.split(/\s+/).filter((w) => /^[(\[⚠✖]?[A-Za-z][a-z]+[,.:;…?!)]?$/.test(w)).length >= 2;

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
      if (!imported && !PICKS.test(to)) {
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

describe('the words of the display layer', () => {
  test('the check finds a sentence, a label and a control’s one word, and passes classes, keys and selectors', () => {
    const source = [
      "el.createEl('p', { cls: 'thoughtknot-quiet metadata-input', text: 'No problems.' });",
      'say(`Line ${n}: ${message}`);',
      "button('Cancel', run);",
      "el.querySelectorAll('button, label, option');",
      "if (e.key === 'Enter') go();",
      "import { word } from '@thoughtknot/core';",
      "el.setText(word('find.none'));",
    ].join('\n');
    assert.deepEqual(wordsIn(source), ['No problems.', 'Line {}: {}', 'Cancel']);
  });

  // proves: words_catalogue
  test('every word a person reads comes from the catalogue, but those kept in the code with why', () => {
    const found = files().flatMap((f) => {
      const kept = KEPT[f.replaceAll('\\', '/')] ?? [];
      return wordsIn(readFileSync(new URL(f, DISPLAY), 'utf8'))
        .filter((w) => kept !== '*' && !kept.includes(w))
        .map((w) => `${f}: ${w}`);
    });
    assert.deepEqual(found, [], 'say each by a key of source-words.ts, with word()');
  });
});
