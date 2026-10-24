// The security response protocol (spec §65): how a problem is spotted and dealt with. The page is
// wiki/Security-response.md. It names each source of problems and the file that runs it. It ranks problems with
// response times, gives every step an owner and keeps a log of practice runs. Pure: the real files are read.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { exists, read } from './repository/repo.js';

const PAGE = 'wiki/Security-response.md';
const page = exists(PAGE) ? read(PAGE) : '';

/** The text of one `## ` section, from its heading to the next. */
const section = (title) => {
  const m = page.match(new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
};

describe('security response protocol (spec §65)', () => {
  test('soc_detection_sources: every source names a file that exists', () => {
    const files = [...section('1\\. Where problems come from').matchAll(/`([^`]+\.(?:yml|json))`/g)].map((m) => m[1]);
    assert.ok(files.length >= 5, 'the page names the workflow of each source');
    for (const file of files) assert.ok(exists(file), `${file} is named on the page but is missing`);
    assert.match(page, /security\/advisories\/new/, 'the private report form is linked');
  });

  test('soc_severity_targets: four levels, each with a time to look and to fix', () => {
    const rows =
      section('2\\. How serious, and how fast').match(/^\| \*\*(Critical|High|Medium|Low)\*\*.*\|\s*$/gm) ?? [];
    assert.equal(rows.length, 4);
    for (const row of rows)
      assert.equal(row.split('|').length, 6, `a level needs a look-within and a fix-within: ${row}`);
  });

  test('soc_response_steps: spot, log, rank, contain, fix, release, tell and learn each have an owner', () => {
    const body = section('3\\. Who does what');
    for (const step of ['Spot', 'Log', 'Rank', 'Contain', 'Fix', 'Release', 'Tell', 'Learn'])
      assert.match(body, new RegExp(`^\\| ${step} \\| \\S`, 'm'), `step ${step} has no owner`);
    assert.match(body, /prevented_by/, 'a fix names its rule in the risk register');
  });

  test('soc_report_routes: a public post about a problem is moved to the private form', () => {
    assert.match(section('3\\. Who does what'), /public issue[^\n]*discussion[^\n]*log/);
    assert.match(page, /hide it, ask the reporter to use the private form/);
    assert.match(read('SECURITY.md'), /wiki\/Security-response/, 'SECURITY.md points to the protocol');
  });

  test('soc_practice_run: the page keeps a log of practice runs', () => {
    assert.match(section('6\\. Practice runs'), /^\| Date \| What we practised \|/m);
  });
});
