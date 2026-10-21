// No words the person reads are written in the code of the areas done so far (editor spec §42, words_catalogue). Those
// areas are the hosts, the display layer, the core's reading and style problems, its proposals, its AI, its editing and
// its views. Each is added as its words move. Each word comes from the catalogue by key, so a translation reaches it. The
// check reads every string the code holds. It flags any that reads as words. That is two plain words with a space, or a
// word that starts a control's text, name or hint. It is also a short template that is a sentence, as `Graph ${g}: ${n}.`
// is. Or it is a joining word alone between spaces, as the ' or ' of a list joined in code is.
// The few kept in the code are listed, each with why.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { AI_AREA, AREAS, EDITING_AREA, KEPT, STEPS_AREA, VIEWS_AREA } from './words-in-code-areas.js';

const ROOT = new URL('../../../', import.meta.url);

/** The files of `areas`, as paths from the repository's root. */
const files = (areas) =>
  areas.flatMap((a) =>
    a.endsWith('/')
      ? readdirSync(new URL(a, ROOT), { recursive: true })
          .map((f) => `${a}${String(f).replaceAll('\\', '/')}`)
          .filter((f) => /\.tsx?$/.test(f))
      : [a],
  );

/** The calls whose strings pick elements of the page, never words: `querySelector('a, b')` and the like. */
const PICKS = /^(?:querySelector|querySelectorAll|closest|matches|createElementNS|setAttributeNS)$/;

/** The properties and calls whose single word a person reads: a control's text, its name or its hint. */
const SHOWN = /^(?:text|title|placeholder|aria-label|say|setText|button)$/;

/** Whether `text` reads as words: two plain words with a space between, as a sentence or a label has. */
const readsAsWords = (text) =>
  text.split(/\s+/).filter((w) => /^[(\[⚠✖]?[A-Za-z][a-z]+[,.:;…?!)]?$/.test(w)).length >= 2;

/** Whether a template reads as a short sentence: a word with a capital, a value, then a stop or colon, as `Graph ${g}: ${n}.`. */
const sentenceTemplate = (text) => /^[A-Z][a-z]+ \{\}/.test(text) && /[.:;!?…]/.test(text);

/** Whether `text` is a joining word alone between spaces, as the ' or ' of a list joined in code is. */
const joiningWord = (text) => /^,? [a-z]+ $/.test(text);

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
        const template = ts.isTemplateExpression(node);
        if (
          readsAsWords(plain) ||
          (template && sentenceTemplate(text)) ||
          (template ? [node.head, ...node.templateSpans.map((t) => t.literal)] : [node]).some((t) =>
            joiningWord(t.text),
          ) ||
          (SHOWN.test(to) && /^[A-Z][a-z]+\b/.test(plain.trim()))
        )
          found.push(text);
      }
      if (!ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The words the files of `areas` say in the code, but those kept with why, each as `file: words`. */
const saidInCode = (areas) =>
  files(areas).flatMap((f) => {
    const kept = KEPT[f] ?? [];
    return wordsIn(readFileSync(new URL(f, ROOT), 'utf8'), f)
      .filter((w) => kept !== '*' && !kept.includes(w))
      .map((w) => `${f}: ${w}`);
  });

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

  test('the check finds a short template that is a sentence: a word, its values and a stop', () => {
    const source = [
      'const said = `Graph ${g}: ${n}.`;',
      'const path = `${folder}/${name}.md`;',
      'const auth = `Bearer ${token}`;',
    ].join('\n');
    assert.deepEqual(wordsIn(source), ['Graph {}: {}.']);
  });

  test('the check finds a joining word alone between spaces, and passes a lone space or stop', () => {
    const source = [
      "const list = xs.join(' or ');",
      "const last = `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`;",
      "const line = xs.join(', ');",
      "const key = xs.join('.');",
    ].join('\n');
    assert.deepEqual(wordsIn(source), [' or ', '{} or {}']);
  });

  test('the check finds the words written between the tags of a TSX file', () => {
    const source = 'const pane = <Box><Text>Open this address:</Text><Text>{why}</Text></Box>;';
    assert.deepEqual(wordsIn(source, 'pane.tsx'), ['Open this address:']);
  });

  // proves: words_catalogue
  test('every word a person reads comes from the catalogue, but those kept in the code with why', () => {
    assert.deepEqual(saidInCode(AREAS), [], 'say each by a key of source-words.ts, with word()');
  });

  // proves: words_catalogue
  test('the core’s AI words, what is sent and why not, come from the catalogue', () => {
    assert.deepEqual(saidInCode(AI_AREA), [], 'say each by a key of ai-source-words.ts, with word()');
  });

  // proves: words_catalogue
  test('the core’s editing words, why an edit is refused and what the inspector says, come from the catalogue', () => {
    assert.deepEqual(saidInCode(EDITING_AREA), [], 'say each by a key of editing-source-words.ts, with word()');
  });

  // proves: words_catalogue
  test('the core’s view words, its kinds, readings and refusals, come from the catalogue', () => {
    assert.deepEqual(saidInCode(VIEWS_AREA), [], 'say each by a key of views-source-words.ts, with word()');
  });

  // proves: words_catalogue
  test('the core’s step and path words, their problems, refusals, labels and animation, come from the catalogue', () => {
    assert.deepEqual(saidInCode(STEPS_AREA), [], 'say each by a key of steps-source-words.ts, with word()');
  });
});
