// The desired state of the GitHub mirror of the requirements: for each requirement of the chosen slices, the issue that
// should exist (title, body, labels, open or closed) and the project fields it fills. Hand-made small graphs stand in
// for the real file; nothing here touches the network. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import {
  CATCH_ALL,
  PROJECT_TITLE,
  assignWorkstreams,
  desiredState,
  firstClause,
  idOfBody,
  isManagedLabel,
  labelStyle,
  markerOf,
  readWorkstreams,
} from '../scripts/github-project-desired.mjs';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';

const board = readBoard(FIXTURE);
const byId = (issues, id) => issues.find((i) => i.id === id);

describe('the workstreams file', () => {
  test('is read as a map from a workstream id to its title and requirement ids', () => {
    assert.deepEqual(readWorkstreams(JSON.stringify(WORKSTREAMS)), WORKSTREAMS);
  });

  test('refuses what is not that shape, naming the workstream', () => {
    assert.throws(() => readWorkstreams('[]'), /workstreams.*object/i);
    assert.throws(() => readWorkstreams('not json'), /workstreams/i);
    assert.throws(() => readWorkstreams(JSON.stringify({ W0: { requirements: [] } })), /W0.*title/);
    assert.throws(
      () => readWorkstreams(JSON.stringify({ W0: { title: 'Zoom', requirements: 'x' } })),
      /W0.*requirements/,
    );
    assert.throws(() => readWorkstreams(JSON.stringify({ W0: { title: 'Zoom', requirements: [3] } })), /W0.*text/);
  });

  test('refuses a requirement listed in two workstreams, naming both', () => {
    const twice = { W0: { title: 'A', requirements: ['x'] }, W1: { title: 'B', requirements: ['x'] } };
    assert.throws(() => readWorkstreams(JSON.stringify(twice)), /x.*W0.*W1/);
  });
});

describe('the workstream of each requirement', () => {
  test('is the one that lists it; a requirement listed nowhere falls to the slice-end workstream', () => {
    const map = assignWorkstreams(board.requirements, WORKSTREAMS);
    assert.equal(map.get('zoom_out_to_fit'), 'W0');
    assert.equal(map.get('focus_link'), 'W1');
    assert.equal(map.get('done_means_proved'), 'S3');
    assert.equal(map.get('stray_new'), CATCH_ALL);
    assert.equal(CATCH_ALL, 'S3');
    assert.equal(map.size, board.requirements.length, 'every requirement lands in exactly one workstream');
  });

  test('tolerates an id the copy does not hold yet', () => {
    const map = assignWorkstreams(board.requirements, WORKSTREAMS);
    assert.equal(map.has('not_in_this_copy'), false);
  });

  test('cannot place a stray requirement when the slice-end workstream is missing', () => {
    const { S3: _gone, ...without } = WORKSTREAMS;
    assert.throws(() => assignWorkstreams(board.requirements, without), /S3/);
  });
});

describe('the first clause of a rule', () => {
  test('stops at a comma, semicolon, colon, dash or full stop', () => {
    assert.equal(firstClause('Zoom out must fit, however large it is.'), 'Zoom out must fit');
    assert.equal(firstClause('Dim all but the neighbours; keep the rest.'), 'Dim all but the neighbours');
    assert.equal(firstClause('A setting: off by default.'), 'A setting');
    assert.equal(firstClause('Tooltips must open — also by touch.'), 'Tooltips must open');
    assert.equal(firstClause('Choosing a link must show it. It must say so.'), 'Choosing a link must show it');
  });

  test('keeps a whole rule that has no clause break, without its final full stop', () => {
    assert.equal(firstClause('Choosing a link must show it.'), 'Choosing a link must show it');
    assert.equal(firstClause('No stop at all'), 'No stop at all');
  });

  test('does not break at a dot inside a word or a number', () => {
    assert.equal(
      firstClause('Version 1.2 must load e.g.json files fast.'),
      'Version 1.2 must load e.g.json files fast',
    );
  });

  test('joins lines and runs of spaces into single spaces', () => {
    assert.equal(firstClause('A  rule\n over   lines.'), 'A rule over lines');
  });

  test('is never over 80 characters: a longer clause is cut at a word and ends with an ellipsis', () => {
    const long = `${'word '.repeat(30)}end.`;
    const clause = firstClause(long);
    assert.ok(clause.length <= 80, `${clause.length}`);
    assert.match(clause, /word…$/);
    assert.equal(firstClause('x'.repeat(200)).length, 80, 'one long word is cut where it stands');
    assert.equal(firstClause('x'.repeat(80)), 'x'.repeat(80));
  });

  test('is empty for an empty rule', () => {
    assert.equal(firstClause(''), '');
  });
});

describe('the marker in an issue body', () => {
  test('is a hidden comment naming the requirement, and is read back from a body', () => {
    assert.equal(markerOf('zoom_out_to_fit'), '<!-- requirement:zoom_out_to_fit -->');
    assert.equal(idOfBody(`text\n\n${markerOf('zoom_out_to_fit')}\n`), 'zoom_out_to_fit');
  });

  test('is the last one in a body that quotes another, and null where there is none', () => {
    assert.equal(idOfBody(`${markerOf('quoted')}\nmore\n${markerOf('real')}`), 'real');
    assert.equal(idOfBody('an issue somebody wrote by hand'), null);
    assert.equal(idOfBody(null), null);
  });
});

describe('the desired issues for chosen slices', () => {
  const { issues } = desiredState(board, WORKSTREAMS, [3, 4]);

  test('hold one issue for each requirement of the chosen slices and no other', () => {
    assert.deepEqual(issues.map((i) => i.id).sort(), [
      'done_means_proved',
      'focus_link',
      'focus_neighbours',
      'stray_new',
      'zoom_out_to_fit',
    ]);
    assert.deepEqual(
      desiredState(board, WORKSTREAMS, [4])
        .issues.map((i) => i.id)
        .sort(),
      ['focus_link', 'stray_new'],
    );
  });

  test('are titled with the id and the first clause of the rule', () => {
    assert.equal(byId(issues, 'zoom_out_to_fit').title, 'zoom_out_to_fit: Zoom out must fit the drawing');
    assert.equal(byId(issues, 'focus_link').title, 'focus_link: Choosing a link must show it');
  });

  test('carry the slice, workstream and status labels, sorted', () => {
    assert.deepEqual(byId(issues, 'zoom_out_to_fit').labels, ['slice-3', 'status:proved', 'workstream:W0']);
    assert.deepEqual(byId(issues, 'focus_neighbours').labels, ['slice-3', 'status:part', 'workstream:W1']);
    assert.deepEqual(byId(issues, 'focus_link').labels, ['slice-4', 'status:open', 'workstream:W1']);
    assert.deepEqual(byId(issues, 'stray_new').labels, ['slice-4', 'status:open', 'workstream:S3']);
  });

  test('are closed when proved and open otherwise', () => {
    assert.equal(byId(issues, 'zoom_out_to_fit').state, 'closed');
    assert.equal(byId(issues, 'focus_neighbours').state, 'open');
    assert.equal(byId(issues, 'focus_link').state, 'open');
    assert.equal(byId(issues, 'done_means_proved').state, 'open', 'a requirement naming no test is open');
  });

  test('hold the project field values, as the options the project offers', () => {
    const issue = byId(issues, 'focus_neighbours');
    assert.deepEqual(
      [issue.slice, issue.workstream, issue.status],
      ['Slice 3', 'W1: Focus, hover and untangle', 'part'],
    );
  });

  test('have a body that opens on a do-not-edit banner naming the source file', () => {
    const body = byId(issues, 'zoom_out_to_fit').body;
    assert.match(body.split('\n')[0], /do not edit/i);
    assert.match(body.split('\n')[0], /requirements\/editor-requirements\.gql/);
    assert.match(body.split('\n')[0], /scripts\/github-project\.mjs/);
  });

  test('have a body with the whole rule, the strength, the slice, the workstream and the status', () => {
    const body = byId(issues, 'focus_neighbours').body;
    assert.ok(body.includes('Choosing a thing should dim all but its neighbours; the rest stays drawn.'));
    assert.match(body, /\*\*Strength:\*\* should/);
    assert.match(body, /\*\*Slice:\*\* 3/);
    assert.match(body, /\*\*Workstream:\*\* W1: Focus, hover and untangle/);
    assert.match(body, /\*\*Status:\*\* part/);
  });

  test('have a body that lists each proving test with its status and files', () => {
    const body = byId(issues, 'focus_neighbours').body;
    assert.match(
      body,
      /`test_done` \(written\): zoom out fits the drawing — `test\/zoom\.test\.js`, `test\/fit\.test\.js`/,
    );
    assert.match(body, /`test_later` \(planned\): a planned proof — `test\/later\.test\.js`/);
  });

  test('have a body that says so when no test is named', () => {
    assert.match(byId(issues, 'done_means_proved').body, /No test is named/);
  });

  test('end their body with the marker, once', () => {
    for (const issue of issues) {
      assert.ok(issue.body.trimEnd().endsWith(markerOf(issue.id)), issue.id);
      assert.equal(issue.body.split(markerOf(issue.id)).length, 2, issue.id);
      assert.equal(idOfBody(issue.body), issue.id);
    }
  });

  test('are the same text each time they are made', () => {
    assert.deepEqual(desiredState(board, WORKSTREAMS, [3, 4]), desiredState(board, WORKSTREAMS, [4, 3]));
  });
});

describe('the project fields', () => {
  const { fields } = desiredState(board, WORKSTREAMS, [3, 4]);

  test('are Slice, Workstream and Status, each a single choice from a fixed set of options', () => {
    assert.deepEqual(Object.keys(fields), ['Slice', 'Workstream', 'Status']);
    assert.deepEqual(fields.Slice, ['Slice 3', 'Slice 4']);
    assert.deepEqual(fields.Status, ['open', 'part', 'proved']);
  });

  test('offer every workstream of the file, in the file’s order, with its title', () => {
    assert.deepEqual(fields.Workstream, ['W0: Zoom', 'W1: Focus, hover and untangle', 'S3: Slice end']);
  });

  test('offer only the chosen slices', () => {
    assert.deepEqual(desiredState(board, WORKSTREAMS, [4]).fields.Slice, ['Slice 4']);
  });

  test('belong to a project titled graph-note requirements', () => {
    assert.equal(PROJECT_TITLE, 'graph-note requirements');
  });
});

describe('the labels this generator owns', () => {
  test('are the slice, workstream and status labels and the removed label, and no others', () => {
    for (const name of [
      'slice-3',
      'workstream:W4',
      'workstream:S3',
      'status:open',
      'status:proved',
      'requirement:removed',
    ])
      assert.ok(isManagedLabel(name), name);
    for (const name of ['bug', 'status', 'slice', 'status:blocked', 'slice-x', 'requirement'])
      assert.equal(isManagedLabel(name), false, name);
  });

  test('each have a colour and a description for a label made new', () => {
    for (const name of ['slice-3', 'workstream:W4', 'status:part', 'requirement:removed']) {
      const style = labelStyle(name);
      assert.match(style.color, /^[0-9A-F]{6}$/);
      assert.ok(style.description.length > 0 && style.description.length <= 100, name);
    }
  });
});
