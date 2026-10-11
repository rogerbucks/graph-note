// One run of one test file in the tests-first replay (scripts/tests-first-run.mjs; spec §12, tests_first): what its
// report shows, whether the run finished, and when it did not, why.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fromJunit, run } from '../scripts/tests-first-run.mjs';

describe('a run against the code before that did not finish', () => {
  // found at 7590e45 (10 Oct 2026): the JUnit reporter writes <testsuites> at once, so a run stopped at the time limit
  // left that much, and was read as finished; its guard, never run, was counted as seen failing
  test('a JUnit report cut off before </testsuites> did not finish, even though it began', () => {
    const cut = '<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n';
    assert.equal(fromJunit(cut).ran, false);
    const whole = `${cut}<testcase name="guards" time="0.1"/>\n</testsuites>\n`;
    assert.deepEqual(fromJunit(whole), { passed: ['guards'], failed: [], ran: true });
  });
});

describe('a test whose name holds characters XML escapes', () => {
  // found 11 Oct 2026: the reader cut a tag at the first `>`, and the reporter leaves `>` bare in an attribute, so a test
  // named with `->` was read with no name and no failure: in neither column, a test the check never saw, passed or not
  const REPORT = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<testsuites>',
    '\t<testsuite name="suite -&gt; &amp;quot;q&amp;quot; &amp; &lt;t>" time="0.002" disabled="0" errors="0" tests="3" failures="1" skipped="0">',
    '\t\t<testcase name="a -> b passes" time="0.000356" classname="c" file="/x/y.test.mjs"/>',
    '\t\t<testcase name="a -> b fails" time="0.000582" classname="c" file="/x/y.test.mjs" failure="1 !== 2 > 0">',
    '\t\t\t<failure type="testCodeFailure" message="1 !== 2 > 0">',
    'Error: at TestContext.&lt;anonymous> (file:///x/y.test.mjs:6:12)',
    '\t\t\t</failure>',
    '\t\t</testcase>',
    `\t\t<testcase name="q &amp;quot;x&amp;quot; &amp;apos;y&amp;apos; &lt; &amp; > &#10;z" time="0.1" classname="c"/>`,
    '\t</testsuite>',
    '</testsuites>',
  ].join('\n');

  test('a report with `>` in a name gives each test, passed or failed, by its exact name', () => {
    const suite = `suite -> "q" & <t>`;
    assert.deepEqual(fromJunit(REPORT), {
      passed: [`${suite} > a -> b passes`, `${suite} > q "x" 'y' < & > \nz`],
      failed: [`${suite} > a -> b fails`],
      ran: true,
    });
  });

  test('an entity is decoded once, so `&amp;lt;` is the text `&lt;`', () => {
    const report = '<testsuites><testcase name="&amp;lt; &amp;#38; &#x26;"/></testsuites>';
    assert.deepEqual(fromJunit(report).passed, ['&lt; &#38; &']);
  });

  test('a run of the real reporter reads each name as written', () => {
    const names = [
      'a -> b passes',
      'x > y',
      'less < than',
      'amp & amp',
      'say "hi" and \'bye\'',
      'tag <b>bold</b>',
      'accent é, emoji 😀, tab\there',
      'two\nlines',
    ];
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-run-'));
    try {
      const lines = [`import { describe, test } from 'node:test';`, `describe('s -> "t" & <u>', () => {`];
      for (const n of names) lines.push(`  test(${JSON.stringify(n)}, () => {});`);
      lines.push(`  test('b -> c fails', () => { throw new Error('1 > 0 "x" <y>'); });`, `});`);
      mkdirSync(join(dir, 'test'));
      writeFileSync(join(dir, 'test', 'names.test.js'), lines.join('\n'));
      const r = run(dir, 'test/names.test.js', dir);
      assert.deepEqual(
        r.passed,
        names.map((n) => `s -> "t" & <u> > ${n}`),
      );
      assert.deepEqual(r.failed, ['s -> "t" & <u> > b -> c fails']);
      assert.equal(r.ran, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('why a run did not finish', () => {
  // review of #44: every run with no report was blamed on load, so a run that fails the same way each time was retried
  test('a run that exits with no report says how it ended, and does not blame the time limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-run-'));
    try {
      mkdirSync(join(dir, 'py', 'tests'), { recursive: true });
      writeFileSync(join(dir, 'py', 'tests', 'test_gone.py'), 'import os\nos._exit(3)\n');
      const r = run(dir, 'py/tests/test_gone.py', dir);
      assert.equal(r.ran, false);
      assert.match(r.why ?? '', /exit status 3/);
      assert.doesNotMatch(r.why ?? '', /time limit/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
