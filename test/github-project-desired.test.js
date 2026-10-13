// The desired state of the GitHub mirror of the requirements: for each requirement of the chosen slices, the issue that
// should exist (title, body, labels, open or closed) and the project fields it fills. Hand-made small graphs stand in
// for the real file; nothing here touches the network. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import {
  BANNER_START,
  CATCH_ALL,
  PROJECT_TITLE,
  adoptedId,
  assignWorkstreams,
  desiredState,
  generatedIdOf,
  idOfBody,
  isManagedLabel,
  labelStyle,
  markerOf,
  neutralise,
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

/** A board of one requirement, for the cases a title or a body needs a particular rule, section or test for. */
const lone = (over = {}, sectionTitle = 'Viewing') => ({
  sections: [{ num: '3', title: sectionTitle }],
  requirements: [
    {
      id: 'zoom_out_to_fit',
      section: '3',
      slice: 3,
      level: 'must',
      rule: 'A rule.',
      tests: [],
      status: 'open',
      ...over,
    },
  ],
});
const only = (b, workstreams = { S3: { title: 'Slice end', requirements: [] } }) =>
  desiredState(b, workstreams, [3]).issues[0];

describe('the title of an issue', () => {
  test('is the title of the requirement’s section, a dot, and the id with its underscores as spaces', () => {
    const { issues } = desiredState(board, WORKSTREAMS, [3, 4]);
    assert.equal(byId(issues, 'zoom_out_to_fit').title, 'Viewing · zoom out to fit');
    assert.equal(byId(issues, 'stray_new').title, 'Viewer aids · stray new');
    assert.equal(byId(issues, 'focus_link').title, 'Viewing · focus link');
  });

  test('always says what the requirement is called: the id’s words are in every title', () => {
    for (const issue of desiredState(board, WORKSTREAMS, [3, 4]).issues)
      assert.ok(issue.title.includes(issue.id.replaceAll('_', ' ')), issue.title);
  });

  test('is just the id’s words when the section has no title', () => {
    assert.equal(only(lone({ section: '99' })).title, 'zoom out to fit');
  });

  test('is never over 100 characters, and a long section title gives way to the id’s words', () => {
    const title = only(lone({}, 'A very long section title '.repeat(10))).title;
    assert.ok(title.length <= 100, `${title.length}`);
    assert.ok(title.endsWith(' · zoom out to fit'), title);
    assert.match(title, /…/);
    const huge = only(lone({ id: 'w'.repeat(150) })).title;
    assert.ok(huge.length <= 100, `${huge.length}`);
  });
});

describe('words in a body that would mention or link', () => {
  test('are wrapped in backticks: an @name or a team, and a #number', () => {
    assert.equal(neutralise('Ask @alice and @org/team about #12.'), 'Ask `@alice` and `@org/team` about `#12`.');
  });

  test('are left alone when they are not mentions, or already in code', () => {
    assert.equal(neutralise('mail a@b.c, colour #fff, ref #x'), 'mail a@b.c, colour #fff, ref #x');
    assert.equal(neutralise('already `@alice` and `#12 and @bob` here'), 'already `@alice` and `#12 and @bob` here');
  });

  test('are wrapped in the rule and in the words a test proves, wherever the body shows them', () => {
    const body = only(
      lone({
        rule: 'Tell @alice about #12.',
        tests: [{ id: 't', proves: 'pings @bob, fixes #7', files: [], where: 'repo', status: 'written' }],
      }),
    ).body;
    assert.equal(body.split('\n')[0], 'Tell `@alice` about `#12`.');
    assert.ok(body.includes('pings `@bob`, fixes `#7`'));
    assert.doesNotMatch(body.replaceAll(/`[^`]*`/g, ''), /[@#]\w/);
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

describe('an issue this generator may adopt', () => {
  const body = byId(desiredState(board, WORKSTREAMS, [3, 4]).issues, 'focus_link').body;
  const issue = (over = {}) => ({ author: 'me', body, ...over });

  test('has the generated banner and the marker at the end, and was written by the signed-in login', () => {
    assert.equal(generatedIdOf(body), 'focus_link');
    assert.equal(generatedIdOf(`${body.replaceAll('\n', '\r\n')}  \n`), 'focus_link');
    assert.equal(adoptedId(issue(), 'me'), 'focus_link');
    assert.equal(adoptedId(issue({ author: 'Me' }), 'me'), 'focus_link', 'logins are not case-sensitive');
  });

  test('is not adopted when somebody else wrote it, though it carries the marker', () => {
    assert.equal(adoptedId(issue({ author: 'stranger' }), 'me'), null);
    assert.equal(adoptedId(issue({ author: undefined }), 'me'), null);
    assert.equal(adoptedId(issue(), undefined), null);
  });

  test('is not adopted without the banner, or when the marker is not at the end', () => {
    assert.equal(generatedIdOf(markerOf('focus_link')), null);
    assert.equal(generatedIdOf(`text\n\n${markerOf('focus_link')}\n`), null);
    assert.equal(generatedIdOf(`${body}\nsomething added after`), null);
    assert.equal(generatedIdOf(body.replace(BANNER_START, '> not the banner')), null);
    assert.equal(generatedIdOf(null), null);
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

  test('have a body that opens on the whole rule, as the title no longer holds it', () => {
    assert.equal(
      byId(issues, 'focus_neighbours').body.split('\n')[0],
      'Choosing a thing should dim all but its neighbours; the rest stays drawn.',
    );
  });

  test('have a body with a do-not-edit banner naming the source file and the script', () => {
    const banner = byId(issues, 'zoom_out_to_fit')
      .body.split('\n')
      .find((l) => l.startsWith(BANNER_START));
    assert.match(banner, /do not edit/i);
    assert.match(banner, /requirements\/editor-requirements\.gql/);
    assert.match(banner, /scripts\/github-project\.mjs/);
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

  test('are Slice, Workstream and Proof, each a single choice; the built-in Status field is not used', () => {
    assert.deepEqual(Object.keys(fields), ['Slice', 'Workstream', 'Proof']);
    assert.deepEqual(fields.Slice, ['Slice 3', 'Slice 4']);
    assert.deepEqual(fields.Proof, ['open', 'part', 'proved']);
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
