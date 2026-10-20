// No meaning is carried by colour alone (editor spec §44, colour_never_alone; WCAG 1.4.1). Each meaning a colour
// carries is carried by a shape, a line, a word or a sign too. So a reader who cannot tell two colours apart loses
// nothing. These are the places a colour once stood alone. Others are checked where they are made: focus, suggested
// names, estimates, parked things, proposals and the changes view.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from '../packages/obsidian/test/host/load-plugin.js';
import { READER, open, type } from '../packages/obsidian/test/host/pane-notes.js';
import { rulesOf, valueOf } from './repository/sheet-rules.js';

// a warning on its own line (a name not in the graph), then an error on its own (a value left out)
const WARNING_LINE = '(eyes)-[:FAVOURS]->(larg)';
const ERROR_LINE = '(x:T {y: })';

before(() => build());

/** The sign at the end of each line that has one, in order. */
const signs = (env) =>
  env.el.querySelectorAll('.thoughtknot-overlay .thoughtknot-line-sign').map((s) => s.textContent.trim());

/** The edit pane with `lines` typed after the reader graph, the caret at the end, once each line has its sign. */
async function typed(lines) {
  const env = await open();
  const text = [READER + ',', ...lines].join('\n');
  type(env.el, text, text.length);
  await until(() => signs(env).length === lines.length);
  return env;
}

/** The words of each row of the fix bar. */
const rows = (env) => env.el.querySelector('.thoughtknot-fixbar').children.map((r) => r.textContent);

describe('an error is told from a warning without its colour', () => {
  // proves: colour_never_alone
  test('by the sign at the end of its line: ✖ for an error, ⚠ for a warning', async () => {
    const env = await typed([WARNING_LINE + ',', ERROR_LINE]);
    try {
      assert.deepEqual(signs(env), ['⚠', '✖']);
    } finally {
      env.uninstall();
    }
  });

  // proves: colour_never_alone
  test('by the sign in the fix bar: ✖ for an error, ⚠ for a warning', async () => {
    for (const [line, sign] of [
      [WARNING_LINE, '⚠'],
      [ERROR_LINE, '✖'],
    ]) {
      const env = await typed([line]);
      try {
        assert.ok(rows(env).length, `a row for ${line}`);
        for (const row of rows(env)) assert.equal(row.slice(0, 2), `${sign} `, row);
      } finally {
        env.uninstall();
      }
    }
  });

  // proves: colour_never_alone
  test('by the line under its words: wavy for an error, dashed for a warning, dotted for a hint', () => {
    const rules = rulesOf('styles.css').filter((r) => !r.media);
    const style = (selector) =>
      rules
        .filter((r) => r.selectors.includes(selector))
        .map(
          (r) => valueOf(r, 'text-decoration-style') ?? valueOf(r, 'text-decoration')?.match(/wavy|dashed|dotted/)?.[0],
        )
        .findLast(Boolean);
    assert.equal(style('.thoughtknot-problem.is-error'), 'wavy');
    assert.equal(style('.thoughtknot-problem.is-warning'), 'dashed');
    assert.equal(style('.thoughtknot-problem.is-hint'), 'dotted');
  });
});
