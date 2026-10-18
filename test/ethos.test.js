// The project's ethos (spec §41, ethos_checked): requirements/ethos.gql holds each principle with its rules, every rule
// names the requirements that check it or says a person checks it or nothing does yet, and the wiki's Ethos page is made
// from it with each rule's state. Pure: the real files are read, nothing is fetched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ethosPage, ethosProblems, readEthos } from '../scripts/ethos.mjs';
import { readBoard } from '../scripts/slice-board.mjs';
import { renderWiki } from '../scripts/wiki.mjs';
import { read } from './repository/repo.js';

const requirementsText = read('requirements/editor-requirements.gql');
const ethosText = read('requirements/ethos.gql');
const { requirements } = readBoard(requirementsText);
const json = (rel) => JSON.parse(read(rel));

/** A small ethos graph, in the file's own form, from lines of nodes and links. */
const ethosOf = (...lines) => `// graph: project_ethos · SOURCE\n${lines.join(',\n')}\n`;
const REQS = [
  { id: 'done_one', status: 'proved' },
  { id: 'half_one', status: 'unproved' },
];

describe('the ethos', () => {
  test('the project’s own ethos names a check for every rule, and only requirements that exist', () => {
    assert.deepEqual(ethosProblems(readEthos(ethosText), requirements), []);
  });

  test('every principle has a name, a reason and at least one rule, in order', () => {
    const { principles } = readEthos(ethosText);
    assert.ok(principles.length >= 5);
    assert.deepEqual(
      principles.map((p) => p.order),
      [...principles.map((p) => p.order)].sort((a, b) => a - b),
    );
    for (const p of principles) {
      assert.ok(p.name && p.why, p.id);
      assert.ok(p.rules.length, p.id);
    }
  });

  test('names each fault: no check, an unknown check, a missing requirement, a rule without a principle, a principle without rules', () => {
    const ethos = readEthos(
      ethosOf(
        "(p_a:Principle {order: 1, name: 'A', why: 'Because.'})",
        "(p_empty:Principle {order: 2, name: 'Empty', why: 'Because.'})",
        "(r_none:Rule {text: 'No check.'})",
        "(r_odd:Rule {text: 'Odd check.', check: 'sometimes', how: 'Maybe.'})",
        "(r_gone:Rule {text: 'Gone.', requirements: 'done_one no_such_one'})",
        "(r_alone:Rule {text: 'Alone.', check: 'person', how: 'Reviewed.'})",
        '(p_a)-[:HAS_RULE]->(r_none)',
        '(p_a)-[:HAS_RULE]->(r_odd)',
        '(p_a)-[:HAS_RULE]->(r_gone)',
      ),
    );
    const problems = ethosProblems(ethos, REQS).join('\n');
    assert.match(problems, /r_none: .*names no check/);
    assert.match(problems, /r_odd: .*"sometimes"/);
    assert.match(problems, /r_gone: .*no_such_one/);
    assert.doesNotMatch(problems, /done_one/);
    assert.match(problems, /r_alone: .*no principle/);
    assert.match(problems, /p_empty: .*no rule/);
  });

  test('the page shows each principle, its reason and each rule with its state', () => {
    const ethos = readEthos(
      ethosOf(
        "(p_a:Principle {order: 2, name: 'Second', why: 'Why two.'})",
        "(p_b:Principle {order: 1, name: 'First', why: 'Why one.'})",
        "(r_done:Rule {text: 'Done rule.', requirements: 'done_one'})",
        "(r_half:Rule {text: 'Half rule.', requirements: 'done_one half_one'})",
        "(r_person:Rule {text: 'Person rule.', check: 'person', how: 'Reviewed by hand.'})",
        "(r_later:Rule {text: 'Later rule.', check: 'not yet', how: 'Still to write.'})",
        '(p_a)-[:HAS_RULE]->(r_done)',
        '(p_a)-[:HAS_RULE]->(r_half)',
        '(p_b)-[:HAS_RULE]->(r_person)',
        '(p_b)-[:HAS_RULE]->(r_later)',
      ),
    );
    const page = ethosPage(ethos, REQS);
    assert.ok(page.indexOf('## 1. First') < page.indexOf('## 2. Second'));
    assert.match(page, /Why one\./);
    assert.match(page, /\| Done rule\. \| ✅ Checked automatically \| `done_one` \|/);
    assert.match(page, /\| Half rule\. \| 🟡 Being built \(1 of 2 proved\) \| `done_one`, `half_one` \|/);
    assert.match(page, /\| Person rule\. \| 👤 Checked by a person \| Reviewed by hand\. \|/);
    assert.match(page, /\| Later rule\. \| ⚪ Not checked yet \| Still to write\. \|/);
    assert.match(page, /1 of 4 rules checked automatically/);
  });

  test('the wiki makes the Ethos page, says where it came from, and names it in the sidebar', () => {
    const pages = renderWiki({
      requirementsText,
      ethosText,
      waves: json('requirements/waves.json').waves,
      workstreams: json('requirements/workstreams.json'),
      baseline: json('quality/baseline.json'),
      versions: json('versions.json'),
      releases: [],
      options: [],
      pages: {},
      sha: '0123456789abcdef',
      today: '2026-10-18',
    });
    assert.match(pages['Ethos.md'], /^# Ethos/);
    assert.match(pages['Ethos.md'], /_Made from `requirements\/ethos\.gql` at \[`0123456`\]/);
    assert.match(pages['_Sidebar.md'], /\[Ethos\]\(Ethos\)/);
  });
});
