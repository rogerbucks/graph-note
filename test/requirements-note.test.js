// The requirements kept as a graph note (editor spec §41, requirements_as_graph_note). The same graph is held as the
// one block of a Markdown note, with prose around it. Like the graph file, it is read by every tool that reads the
// requirements, and passes the same audit. It gives the same board, questions and slice, and is compared across a
// change the same way.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BANNER,
  REQUIREMENTS,
  auditRequirements,
  requirementsGraph,
  sliceDone,
} from '../scripts/check-requirements.mjs';
import { refusedChanges } from '../scripts/check-requirements-flips.mjs';
import { readBoard } from '../scripts/slice-board.mjs';
import { readQuestions } from '../scripts/wiki.mjs';

const FILE = readFileSync(new URL(`../${REQUIREMENTS}`, import.meta.url), 'utf8');

/** The graph file as a note: a heading and prose, the graph as its one block, and prose after. */
const asNote = (graph) =>
  '# Editor requirements\n\nThe one source of what the editor must do.\n\n```gql\n' +
  graph.replace(/\n$/, '') +
  '\n```\n\nChange a requirement here, in a pull request.\n';

describe('the requirements kept as a graph note', () => {
  // proves: requirements_as_graph_note
  test('pass the same audit, and give the same board, questions and slice, as the graph file', () => {
    const note = asNote(FILE);
    assert.equal(requirementsGraph(FILE), FILE);
    assert.equal(requirementsGraph(note).split('\n')[0], BANNER[0]);
    assert.deepEqual(auditRequirements(note), auditRequirements(FILE));
    assert.deepEqual(readBoard(note), readBoard(FILE));
    assert.deepEqual(readQuestions(note), readQuestions(FILE));
    assert.deepEqual(sliceDone(note, 3), sliceDone(FILE, 3));
  });

  // proves: requirements_as_graph_note
  test('are compared across a change the same way, whichever form each side is in', () => {
    const moved = FILE.replace("status: 'written'", "status: 'planned'");
    const asFile = refusedChanges(FILE, moved);
    assert.ok(asFile.length > 0);
    assert.deepEqual(refusedChanges(asNote(FILE), asNote(moved)), asFile);
    assert.deepEqual(refusedChanges(FILE, asNote(moved)), asFile);
    assert.deepEqual(refusedChanges(asNote(FILE), FILE), []);
  });

  // proves: requirements_as_graph_note
  test('a note without the requirements’ own block, or with two, is refused by the audit', () => {
    const none = '# Notes\n\n```gql\n// graph: other\n(a:Thing)\n```\n';
    assert.ok(auditRequirements(none).some((p) => p.kind === 'banner'));
    const two = asNote(FILE) + '\n```gql\n' + FILE + '```\n';
    assert.ok(auditRequirements(two).length > 0);
  });
});
