// The desired state of the GitHub mirror of the requirements: for each requirement of the chosen slices, the issue that
// should exist (title, body, labels, open or closed) and the project fields it fills. Hand-made small graphs stand in
// for the real file; nothing here touches the network. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import {
  BANNER_START,
  BUILD_STATUSES,
  BUILD_STATUS_FIELD,
  CATCH_ALL,
  FIXED_FIELDS,
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
  withSeed,
} from '../scripts/github-project-desired.mjs';
import {
  FIXTURE,
  FIXTURE_WITH_QUESTIONS,
  WORKSTREAMS,
  WORKSTREAMS_WITH_QUESTIONS,
} from './repository/github-project-fixture.js';

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

  test('are Slice, Workstream, Proof and Build status, each a single choice; the built-in Status field is not used', () => {
    assert.deepEqual(Object.keys(fields), ['Slice', 'Workstream', 'Proof', 'Build status']);
    assert.deepEqual(fields.Slice, ['Slice 3', 'Slice 4']);
    assert.deepEqual(fields.Proof, ['open', 'part', 'proved']);
  });

  test('include Build status, a fourth single choice with the six stages of a build, in the order they happen', () => {
    assert.deepEqual(BUILD_STATUSES, [
      'Not started',
      'In PR',
      'Checks failing',
      'Checks passing',
      'Merged',
      'Released',
    ]);
    assert.deepEqual(fields[BUILD_STATUS_FIELD], BUILD_STATUSES);
    assert.equal(BUILD_STATUS_FIELD, 'Build status');
    assert.ok(
      FIXED_FIELDS.includes(BUILD_STATUS_FIELD),
      'its options are never replaced, so its values are never cleared',
    );
  });

  test('give every issue the first stage, Not started, and the Status Todo, unless some of its tests are written', () => {
    const { issues } = desiredState(board, WORKSTREAMS_WITH_QUESTIONS, [3, 4]);
    assert.ok(issues.length > 0);
    assert.ok(issues.every((i) => i.buildStatus === 'Not started'));
    for (const i of issues) assert.equal(i.progress, i.status === 'part' ? 'In Progress' : 'Todo', i.id);
  });

  test('give a requirement whose only test is partial the Status In Progress, not Todo', () => {
    const withPartial = readBoard(`${FIXTURE.trimEnd()},
(partial_thing:Requirement {section: '3', slice: 3, level: 'must', rule: 'Only a partial test proves this so far.'}),
(test_partial:Test {proves: 'the part that is written', file: 'test/part.test.js', where: 'repo', status: 'partial'}),
(partial_thing)-[:PROVED_BY]->(test_partial)
`);
    const { issues } = desiredState(withPartial, WORKSTREAMS, [3]);
    const partial = byId(issues, 'partial_thing');
    assert.equal(partial.status, 'part');
    assert.equal(partial.progress, 'In Progress');
    assert.equal(byId(issues, 'done_means_proved').progress, 'Todo', 'an open requirement stays Todo');
  });

  test('take a seed in place of those, for the ids it names, and no more', () => {
    const desired = desiredState(board, WORKSTREAMS, [3, 4]);
    const seed = new Map([
      ['zoom_out_to_fit', { buildStatus: 'Released', progress: 'Done' }],
      ['not_an_issue', { buildStatus: 'Merged', progress: 'Done' }],
    ]);
    const seeded = withSeed(desired, seed);
    const of = (id) => seeded.issues.find((i) => i.id === id);
    assert.deepEqual([of('zoom_out_to_fit').buildStatus, of('zoom_out_to_fit').progress], ['Released', 'Done']);
    assert.deepEqual([of('focus_link').buildStatus, of('focus_link').progress], ['Not started', 'Todo']);
    assert.equal(seeded.issues.length, desired.issues.length);
    assert.deepEqual(seeded.fields, desired.fields);
    assert.equal(
      desired.issues.find((i) => i.id === 'zoom_out_to_fit').buildStatus,
      'Not started',
      'the original is not changed',
    );
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
    for (const name of ['bug', 'status', 'slice', 'status:blocked', 'slice-x', 'requirement', 'questions'])
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

describe('the desired issues for open questions', () => {
  const asked = readBoard(FIXTURE_WITH_QUESTIONS);
  const state = desiredState(asked, WORKSTREAMS_WITH_QUESTIONS, [3, 4]);
  const question = byId(state.issues, 'q_01_ai_interface');

  test('are one for each question of the chosen slices, beside the requirements', () => {
    const ids = state.issues.map((i) => i.id);
    assert.ok(ids.includes('q_01_ai_interface') && ids.includes('q_02_listed'));
    assert.equal(ids.includes('q_03_old'), false, 'a question outside the chosen slices has no issue');
    assert.equal(ids.length, 7);
    assert.deepEqual(
      desiredState(board, WORKSTREAMS_WITH_QUESTIONS, [3, 4])
        .issues.map((i) => i.id)
        .sort(),
      ['done_means_proved', 'focus_link', 'focus_neighbours', 'stray_new', 'zoom_out_to_fit'],
      'a copy with no question adds nothing',
    );
  });

  test('are titled Open question, a dot, the number and the first words of the question, within 100 characters', () => {
    assert.equal(byId(state.issues, 'q_02_listed').title, 'Open question · Q-02 A question a workstream lists.');
    assert.ok(question.title.startsWith('Open question · Q-01 Which interface'), question.title);
    const long = readBoard(
      FIXTURE_WITH_QUESTIONS.replace('A question a workstream lists.', `${'Many long words '.repeat(12)}end.`),
    );
    const title = byId(desiredState(long, WORKSTREAMS_WITH_QUESTIONS, [4]).issues, 'q_02_listed').title;
    assert.ok(title.length <= 100, `${title.length}`);
    assert.ok(title.startsWith('Open question · Q-02 Many long words'), title);
    const cut = title.slice('Open question · Q-02 '.length, -1);
    assert.ok(title.endsWith('…'), title);
    assert.ok(`${'Many long words '.repeat(12)}end.`.startsWith(`${cut} `), 'the question is cut at a word');
  });

  test('have a body that opens on the question, neutralised, then the banner, kind, slice and workstream', () => {
    const lines = question.body.split('\n');
    assert.equal(lines[0], 'Which interface do external AI tools use to query the graph? Ask `@alice` about `#12`.');
    assert.ok(lines[2].startsWith(BANNER_START), lines[2]);
    assert.match(question.body, /- \*\*Kind:\*\* open question/);
    assert.match(question.body, /- \*\*Slice:\*\* 3/);
    assert.match(question.body, /- \*\*Workstream:\*\* Q: Open questions/);
  });

  test('list the requirements each blocks, or say it blocks nothing named', () => {
    assert.match(question.body, /\*\*Blocks:\*\*\n\n- `zoom_out_to_fit`\n- `focus_link`\n/);
    assert.match(byId(state.issues, 'q_02_listed').body, /_Blocks nothing named\._/);
  });

  test('end their body with the marker requirements use, so adoption works unchanged', () => {
    assert.ok(question.body.trimEnd().endsWith(markerOf('q_01_ai_interface')));
    assert.equal(generatedIdOf(question.body), 'q_01_ai_interface');
    assert.equal(adoptedId({ author: 'me', body: question.body }, 'me'), 'q_01_ai_interface');
    assert.deepEqual(state, desiredState(asked, WORKSTREAMS_WITH_QUESTIONS, [4, 3]), 'the same text each time');
  });

  test('carry the slice, question and workstream labels, sorted, stay open, and are open in the Proof field', () => {
    assert.deepEqual(question.labels, ['kind:question', 'slice-3', 'workstream:Q']);
    assert.equal(question.state, 'open');
    assert.deepEqual([question.slice, question.workstream, question.status], ['Slice 3', 'Q: Open questions', 'open']);
  });

  test('take the workstream that lists the question, else the open-questions workstream', () => {
    assert.equal(byId(state.issues, 'q_02_listed').workstream, 'W1: Focus, hover and untangle');
    assert.deepEqual(byId(state.issues, 'q_02_listed').labels, ['kind:question', 'slice-4', 'workstream:W1']);
  });

  test('cannot place an unlisted question when the open-questions workstream is missing', () => {
    const { Q: _gone, ...without } = WORKSTREAMS_WITH_QUESTIONS;
    assert.throws(() => desiredState(asked, without, [3, 4]), /q_01_ai_interface.*\bQ\b/);
  });

  test('count as known in every slice, so a question outside the chosen slices is not taken as removed', () => {
    assert.ok(state.known.includes('q_03_old'));
    assert.ok(state.known.includes('q_01_ai_interface'));
  });
});

describe('the question label', () => {
  test('is namespaced as kind:question, so GitHub’s own question label stays somebody’s own', () => {
    assert.equal(isManagedLabel('question'), false);
    assert.equal(isManagedLabel('kind:other'), false);
    const asked = desiredState(readBoard(FIXTURE_WITH_QUESTIONS), WORKSTREAMS_WITH_QUESTIONS, [3]);
    assert.ok(byId(asked.issues, 'q_01_ai_interface').labels.includes('kind:question'));
  });

  test('is one this generator owns, with its own description', () => {
    assert.ok(isManagedLabel('kind:question'));
    const style = labelStyle('kind:question');
    assert.match(style.color, /^[0-9A-F]{6}$/);
    assert.equal(style.description, 'An open question, generated from the requirements file');
  });
});
