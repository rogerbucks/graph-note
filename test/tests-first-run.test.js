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
    `\t\t<testcase name="q &amp;quot;x&amp;quot; 'y' &amp;apos;z&amp;apos; &lt; &amp; > &#10;w" time="0.1" classname="c"/>`,
    '\t</testsuite>',
    '</testsuites>',
  ].join('\n');

  test('a report with `>` in a name gives each test, passed or failed, by its exact name', () => {
    const suite = `suite -> "q" & <t>`;
    assert.deepEqual(fromJunit(REPORT), {
      passed: [`${suite} > a -> b passes`, `${suite} > q "x" 'y' &apos;z&apos; < & > \nw`],
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
      'a name that spells &apos; out',
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

/** Runs `source` as a test file in a fresh folder. */
function runSource(source) {
  const dir = mkdtempSync(join(tmpdir(), 'tests-first-run-'));
  try {
    mkdirSync(join(dir, 'test'));
    writeFileSync(join(dir, 'test', 'x.test.js'), source);
    return run(dir, 'test/x.test.js', dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// the report is written by Node's JUnit reporter; its text differs a little between Node 24 (CI) and later versions, so
// these tests write only what both give: a test's name, its diagnostics and its failures
describe('no test vanishes without a word', () => {
  // review of #72 (11 Oct 2026): a tag not in the exact `name="value"` shape was skipped, and the run still read as whole
  const whole = (body) => `<testsuites>\n${body}\n</testsuites>\n`;

  for (const tag of [
    '<testcase name="a"failure="1"/>',
    '<testcase name="a" failure/>',
    '<testcase name=a failure=1/>',
    '<testcase name="a" failure="1"',
  ]) {
    test(`${tag} is not skipped: the run did not finish reading`, () => {
      const read = fromJunit(whole(`<testcase name="ok"/>\n${tag}\n<testcase name="b"/>`));
      assert.equal(read.ran, false);
      assert.match(read.why ?? '', /1 testcase tag could not be read/);
    });
  }

  test('a testsuite tag it cannot read is not skipped either, for the prefix of the tests in it would be lost', () => {
    const read = fromJunit(whole('<testsuite name=s>\n<testcase name="a"/>\n</testsuite>'));
    assert.equal(read.ran, false);
    assert.match(read.why ?? '', /1 testsuite tag could not be read/);
  });

  test('a report cut off in the middle of a tag says nothing of tags: it did not finish', () => {
    const read = fromJunit('<testsuites>\n<testcase name="a"/>\n<testcase name="b" fail');
    assert.equal(read.ran, false);
    assert.equal(read.why, undefined);
  });
});

describe('a diagnostic is not a test', () => {
  // review of #72 (11 Oct 2026): the reporter writes t.diagnostic() text as an XML comment, and the reader scanned inside
  const fake = '</testsuite><testcase name="fake" failure="1"/>';

  test('a tag inside a comment is not read, so no test is made up and no suite is closed', () => {
    const report = `<testsuites>\n<testsuite name="s">\n<!-- ${fake} -->\n<testcase name="a"/>\n</testsuite>\n</testsuites>`;
    assert.deepEqual(fromJunit(report), { passed: ['s > a'], failed: [], ran: true });
  });

  test('a `</testsuites>` inside a comment does not finish an unfinished run', () => {
    assert.equal(fromJunit('<testsuites>\n<testcase name="a"/>\n<!-- </testsuites> -->\n').ran, false);
  });

  test('a real run with such diagnostics gives its tests and nothing else', () => {
    const r = runSource(
      [
        `import { describe, test } from 'node:test';`,
        `describe('s', () => {`,
        `  test('d', (t) => {`,
        `    t.diagnostic(${JSON.stringify(fake)});`,
        `    t.diagnostic('</testsuites>');`,
        `    t.diagnostic('a -- b --> c');`,
        `  });`,
        `  test('next', () => {});`,
        `});`,
      ].join('\n'),
    );
    assert.deepEqual(r, { passed: ['s > d', 's > next'], failed: [], ran: true });
  });
});

describe('a failure the report does not show', () => {
  // review of #72 (11 Oct 2026): a parent test that throws after its subtests pass is a <testsuite> with no failure, so
  // only its passing subtests were read, and the run looked clean
  test('a parent that fails after its subtests pass makes the run unreadable, with the exit status', () => {
    const r = runSource(
      [
        `import { test } from 'node:test';`,
        `test('parent', async (t) => {`,
        `  await t.test('sub ok', () => {});`,
        `  throw new Error('parent');`,
        `});`,
      ].join('\n'),
    );
    assert.equal(r.ran, false);
    assert.match(r.why ?? '', /exit status 1/);
    assert.match(r.why ?? '', /no failed test/);
  });

  test('a run that passes exits 0 and is read as it was', () => {
    const r = runSource(`import { test } from 'node:test';\ntest('a', () => {});\ntest('b', () => {});\n`);
    assert.deepEqual(r, { passed: ['a', 'b'], failed: [], ran: true });
  });

  test('a run with a failed test read keeps it, though its exit status is not 0', () => {
    const r = runSource(
      `import { test } from 'node:test';\ntest('a', () => {});\ntest('b', () => { throw new Error('b'); });\n`,
    );
    assert.deepEqual(r, { passed: ['a'], failed: ['b'], ran: true });
  });

  test('a Python class whose setUpClass fails makes the run unreadable, not its tests passed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-run-'));
    try {
      mkdirSync(join(dir, 'py', 'tests'), { recursive: true });
      const source = [
        'import unittest',
        'class Broken(unittest.TestCase):',
        '    @classmethod',
        '    def setUpClass(cls):',
        '        raise RuntimeError("setup")',
        '    def test_never_ran(self):',
        '        pass',
        '',
      ].join('\n');
      writeFileSync(join(dir, 'py', 'tests', 'test_broken.py'), source);
      const r = run(dir, 'py/tests/test_broken.py', dir);
      assert.equal(r.ran, false);
      assert.deepEqual(r.passed, []);
      assert.match(r.why ?? '', /1 failure could not be matched to a test/);
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
