// A model's row of the destination matrix (editor spec §19, model_ceiling; Roger, 16 Oct 2026): in a model's settings the
// user picks a row, never guessed from the model's address or name. The model may receive exactly the classes the row
// marks yes. Each conditional class is off until the user switches it on for that model. A no is never allowed. What a
// model may receive is a set of classes, not a rank. The host hands the core plain rows. The Obsidian layer reads the
// note, tested in packages/obsidian/test/matrix-note.test.js. Classes match by name, and a settings table maps other
// names by hand. A class matched by neither is flagged, never guessed. With no row picked the model's ceiling stands.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSend } from '../src/ai.ts';
import { clearance } from '../src/ai-ceiling.ts';
import {
  classMapFrom,
  classMapProblems,
  classMapText,
  matchClass,
  matrixGrants,
  matrixProblems,
  unmatchedClasses,
} from '../src/ai-matrix.ts';
import { DEFAULT_SETTINGS, OPTIONS, aiModel, settingsFrom } from '../src/settings.ts';
import { inOrder } from './text-find.js';

const LEVELS = ['Public', 'Internal', 'Confidential', 'Restricted'];
const cell = (name, mark, condition) => ({ class: name, mark, ...(condition ? { condition } : {}) });
const ROWS = [
  {
    name: 'Local model',
    cells: [cell('Public', 'yes'), cell('Internal', 'yes'), cell('Confidential', 'conditional', 'on this device only')],
  },
  {
    name: 'Hosted chat',
    cells: [cell('Public', 'yes'), cell('Internal', 'conditional', 'with history off'), cell('Confidential', 'no')],
  },
  // a set, not a rank: Internal is allowed and Public is not
  { name: 'Odd', cells: [cell('Public', 'no'), cell('Internal', 'yes'), cell('Confidential', 'no')] },
  // yes at the highest classification still reaches no model
  { name: 'Reckless', cells: [cell('Public', 'yes'), cell('Restricted', 'yes')] },
];
const MATRIX = { rows: ROWS, classMap: {} };
/** A switch the user turned on, with the condition the row had when they did. */
const sw = (name, condition) => ({ class: name, condition });
const URL_OK = 'http://localhost:11434/v1/chat/completions';
const model = (name, extra = {}) => ({
  name,
  purpose: 'Proposing changes',
  ceiling: 'Public',
  endpoint: URL_OK,
  model: 'm',
  ...extra,
});
const ask = (m, level, matrix = MATRIX) => clearance(level, m, LEVELS, [m], 'Restricted', matrix);
const cleared = (r) => 'cleared' in r && r.cleared === true;

describe('a model may receive exactly the classes its row marks yes', () => {
  test('a yes class is cleared, and a conditional one is not until switched on', () => {
    const m = model('A', { matrixRow: 'Local model' });
    assert.ok(cleared(ask(m, 'Public')));
    assert.ok(cleared(ask(m, 'Internal')));
    assert.match(ask(m, 'Confidential').refused, /Confidential/);
  });

  test('the highest classification is never cleared, whatever the row says', () => {
    const m = model('A', { matrixRow: 'Reckless', matrixOn: [sw('Restricted', '')] });
    assert.ok(cleared(ask(m, 'Public')));
    assert.match(ask(m, 'Restricted').refused, /nothing at it is ever sent/);
  });

  test('a class the row has no column for is refused, saying so', () => {
    const m = model('A', { matrixRow: 'Hosted chat' });
    assert.match(ask(m, 'Restricted').refused, /nothing at it is ever sent/);
    const lone = { rows: [{ name: 'Lone', cells: [cell('Public', 'yes')] }], classMap: {} };
    assert.match(ask(model('A', { matrixRow: 'Lone' }), 'Internal', lone).refused, /Lone has no class for Internal/);
  });

  test('what a model may receive is a set of classes, not one rank', () => {
    const m = model('A', { matrixRow: 'Odd', ceiling: 'Restricted' });
    assert.ok(cleared(ask(m, 'Internal')));
    assert.match(ask(m, 'Public').refused, /marks Public never to be sent/);
  });
});

describe('a conditional class is off until the user switches it on for that model', () => {
  test('off by default, with its condition said, and on once switched', () => {
    const off = model('A', { matrixRow: 'Hosted chat' });
    const why = ask(off, 'Internal').refused;
    assert.match(why, /with history off/);
    assert.match(why, /switch/i);
    assert.ok(
      cleared(
        ask(model('A', { matrixRow: 'Hosted chat', matrixOn: [sw('Internal', 'with history off')] }), 'Internal'),
      ),
    );
  });

  test('a switch is for one model and one class: others stay off', () => {
    const on = model('A', { matrixRow: 'Local model', matrixOn: [sw('Confidential', 'on this device only')] });
    const other = model('B', { matrixRow: 'Local model' });
    assert.ok(cleared(clearance('Confidential', on, LEVELS, [on, other], 'Restricted', MATRIX)));
    assert.ok('refused' in clearance('Confidential', other, LEVELS, [on, other], 'Restricted', MATRIX));
  });

  test('the grants list each class with its mark, its condition beside the switch, and whether the switch is on', () => {
    const m = model('A', { matrixRow: 'Hosted chat', matrixOn: [sw('internal', 'with history off')] });
    const g = matrixGrants(m, ROWS, LEVELS, {});
    assert.deepEqual(
      g.map((x) => [x.name, x.mark, x.condition ?? '', x.on, x.allowed]),
      [
        ['Public', 'yes', '', false, true],
        ['Internal', 'conditional', 'with history off', true, true],
        ['Confidential', 'no', '', false, false],
      ],
    );
  });
});

describe('a no is never allowed', () => {
  test('refused, and a switch for it changes nothing', () => {
    const m = model('A', { matrixRow: 'Hosted chat', matrixOn: [sw('Confidential', '')] });
    assert.match(ask(m, 'Confidential').refused, /marks Confidential never to be sent/);
    assert.equal(matrixGrants(m, ROWS, LEVELS, {}).find((x) => x.name === 'Confidential').allowed, false);
  });
});

describe('with no row picked the old ceiling stands', () => {
  test('a model with no row, or an empty one, is cleared up to its ceiling and no further', () => {
    for (const extra of [{}, { matrixRow: '' }]) {
      const m = model('A', { ceiling: 'Internal', ...extra });
      assert.ok(cleared(ask(m, 'Internal')));
      assert.ok('refused' in ask(m, 'Confidential'));
      assert.deepEqual(ask(m, 'Confidential'), clearance('Confidential', m, LEVELS, [m], 'Restricted'));
    }
  });

  test('a row picked replaces the ceiling: a model with the top ceiling gets only what its row marks', () => {
    const m = model('A', { ceiling: 'Confidential', matrixRow: 'Hosted chat' });
    assert.ok('refused' in ask(m, 'Confidential'));
  });

  test('the row is never guessed from the model’s name or address', () => {
    const named = model('Local model', { ceiling: 'Public' });
    assert.match(ask(named, 'Internal').refused, /ceiling, Public/);
    // the row Local model would refuse Confidential (conditional, off): the ceiling clears it, so no row was used
    assert.ok(cleared(ask(model('Local model', { ceiling: 'Confidential' }), 'Confidential')));
    assert.ok(cleared(ask(model('Hosted chat', { ceiling: 'Internal' }), 'Internal')));
    const local = model('Whatever', { ceiling: 'Public', endpoint: 'http://localhost:1/v1/chat/completions' });
    assert.ok('refused' in ask(local, 'Internal'));
  });

  test('a row picked that the matrix no longer has refuses, asking for a choice again', () => {
    const m = model('A', { matrixRow: 'Gone' });
    assert.match(ask(m, 'Public').refused, /“Gone”.*choose it again/s);
    assert.match(ask(m, 'Public', null).refused, /choose it again/);
  });
});

describe('classes match by name, a settings table maps the others, and an unmatched one is flagged', () => {
  const OTHER = [
    {
      name: 'Local',
      cells: [cell(' public ', 'yes'), cell('OPEN', 'yes'), cell('Unmoderated', 'yes'), cell('Odd', 'yes')],
    },
  ];

  test('the same name in any case or spacing matches', () => {
    assert.equal(matchClass(' public ', LEVELS, {}), 'Public');
    assert.equal(matchClass('INTERNAL', LEVELS, {}), 'Internal');
  });

  test('another name is matched only through the table, which maps to a classification that exists', () => {
    assert.equal(matchClass('Open', LEVELS, {}), null);
    assert.equal(matchClass('open', LEVELS, { Open: 'Public' }), 'Public');
    assert.equal(matchClass('Open', LEVELS, { Open: 'Nonexistent' }), null);
  });

  test('a class matched by neither is flagged, and not allowed even when its row says yes', () => {
    assert.deepEqual(unmatchedClasses(OTHER, LEVELS, { Open: 'Public' }), ['Unmoderated', 'Odd']);
    const m = model('A', { matrixRow: 'Local' });
    const g = matrixGrants(m, OTHER, LEVELS, { Open: 'Public' });
    assert.deepEqual(
      g.map((x) => [x.name, x.level, x.allowed]),
      [
        [' public ', 'Public', true],
        ['OPEN', 'Public', true],
        ['Unmoderated', null, false],
        ['Odd', null, false],
      ],
    );
  });

  test('a note’s class that the table maps is cleared as the classification it maps to', () => {
    const matrix = { rows: OTHER, classMap: { Unmoderated: 'Internal' } };
    const m = model('A', { matrixRow: 'Local' });
    assert.ok(cleared(ask(m, 'Internal', matrix)));
    assert.match(
      ask(m, 'Confidential', matrix).refused,
      /the matrix row Local has no class for Confidential.*not used: OPEN, Odd\./s,
    );
  });

  test('the table is kept as text, one pair a line, and read back', () => {
    const map = { Unmoderated: 'Internal', Open: 'Public' };
    assert.deepEqual(classMapFrom(classMapText(map)), map);
    assert.deepEqual(classMapFrom('a: b\n\n bad line \n c : d '), { a: 'b', c: 'd' });
  });
});

describe('the models cleared for a note are offered, by their rows', () => {
  test('a refusal names the other models whose rows clear it', () => {
    const hosted = model('Hosted', { matrixRow: 'Hosted chat' });
    const local = model('Local', { matrixRow: 'Local model' });
    const r = clearance('Internal', hosted, LEVELS, [hosted, local], 'Restricted', MATRIX);
    assert.match(r.refused, /Local is cleared for Internal/);
    assert.deepEqual(r.cleared, ['Local']);
  });
});

describe('the settings keep the row, the switches, the note and the table', () => {
  test('a model keeps its row and switches, and leaves them out when no row is picked', () => {
    assert.deepEqual(Object.keys(aiModel({ name: 'A' })).sort(), [
      'ceiling',
      'endpoint',
      'keyName',
      'model',
      'name',
      'purpose',
    ]);
    const m = aiModel({
      name: 'A',
      matrixRow: ' Local model ',
      matrixOn: [sw('Confidential', 'x'), 'Bad', { class: 3 }, sw('confidential', 'y')],
    });
    assert.equal(m.matrixRow, 'Local model');
    assert.deepEqual(m.matrixOn, [sw('Confidential', 'x')]);
  });

  test('the note and the table are options, read back, with safe defaults', () => {
    for (const key of ['aiMatrixNote', 'aiClassMap'])
      assert.ok(OPTIONS.some((o) => o.key === key && o.section === 'AI models'));
    assert.equal(DEFAULT_SETTINGS.aiMatrixNote, '');
    assert.deepEqual(DEFAULT_SETTINGS.aiClassMap, {});
    const s = settingsFrom({ aiMatrixNote: 'Policy/Classification.md', aiClassMap: { Open: 'Public', Bad: 3 } });
    assert.equal(s.aiMatrixNote, 'Policy/Classification.md');
    assert.deepEqual(s.aiClassMap, { Open: 'Public' });
    assert.deepEqual(settingsFrom({ aiMatrixNote: 5, aiClassMap: 'x' }).aiClassMap, {});
  });
});

describe('a send is held to the row', () => {
  const BODY = "# R\n\n```gql\n// graph: reader\n(question:Question {name: 'Which?'})\n```\n";
  const send = (m, level, extra = {}) =>
    prepareSend({
      settings: { ...DEFAULT_SETTINGS, aiUse: 'on', aiModels: [m], ...extra },
      model: m.name,
      note: BODY,
      notePath: 'R.md',
      level,
      choice: { graph: 'reader', what: 'graph' },
      question: 'What is missing?',
      matrix: ROWS,
    });

  test('refused above the row, and sent once the switch is on, saying whose row it is', () => {
    const off = model('Hosted', { matrixRow: 'Hosted chat' });
    assert.match(send(off, 'Internal').refused, /with history off/);
    const on = model('Hosted', { matrixRow: 'Hosted chat', matrixOn: [sw('Internal', 'with history off')] });
    const ok = send(on, 'Internal');
    assert.ok(!('refused' in ok));
    assert.match(ok.summary[0], /matrix row Hosted chat/);
  });

  test('the settings’ table is used, and without rows a model with a row sends nothing', () => {
    const m = model('Hosted', { matrixRow: 'Local model' });
    assert.ok(!('refused' in send(m, 'Internal')));
    const none = prepareSend({
      settings: { ...DEFAULT_SETTINGS, aiUse: 'on', aiModels: [m] },
      model: 'Hosted',
      note: BODY,
      notePath: 'R.md',
      level: 'Internal',
      choice: { graph: 'reader', what: 'graph' },
      question: 'q',
    });
    assert.match(none.refused, /choose it again/);
  });
});

describe('a duplicate never fails open: the first match does not win', () => {
  const dupRows = [
    { name: 'Dup', cells: [cell('Public', 'yes')] },
    { name: 'dup', cells: [cell('Public', 'no')] },
    ...ROWS,
  ];

  test('a row name that appears twice, in any case, refuses and is flagged', () => {
    const m = model('A', { matrixRow: 'Dup' });
    assert.match(ask(m, 'Public', { rows: dupRows, classMap: {} }).refused, /more than once/);
    assert.match(
      ask(model('B', { matrixRow: 'DUP' }), 'Public', { rows: dupRows, classMap: {} }).refused,
      /more than once/,
    );
    assert.ok(matrixProblems(dupRows, LEVELS, {}).some((p) => inOrder(p, 'Dup', 'more than once')));
    assert.deepEqual(matrixProblems(ROWS, LEVELS, {}), []);
  });

  test('two columns standing for one classification, by name or through the table, refuse the row', () => {
    const rows = [{ name: 'Two', cells: [cell('Public', 'yes'), cell('Open', 'no')] }];
    const m = model('A', { matrixRow: 'Two' });
    const mapped = { rows, classMap: { Open: 'Public' } };
    assert.match(ask(m, 'Public', mapped).refused, /Public and Open both stand for Public/);
    assert.equal(matrixProblems(rows, LEVELS, { Open: 'Public' }).length, 1);
    // unmapped, Open is only flagged and the row still works
    assert.ok(cleared(ask(m, 'Public', { rows, classMap: {} })));
    const twice = [{ name: 'Twice', cells: [cell('Public', 'yes'), cell(' public ', 'no')] }];
    assert.match(
      ask(model('A', { matrixRow: 'Twice' }), 'Public', { rows: twice, classMap: {} }).refused,
      /both stand for Public/,
    );
  });
});

describe('a switch is consent to the condition it was given under', () => {
  const rows = (mark, condition) => [{ name: 'R', cells: [cell('Public', 'yes'), cell('Internal', mark, condition)] }];
  const at = (r, on) => ask(model('A', { matrixRow: 'R', matrixOn: on }), 'Internal', { rows: r, classMap: {} });
  const grant = (r, on) => matrixGrants(model('A', { matrixRow: 'R', matrixOn: on }), r, LEVELS, {})[1];

  test('on while the note’s condition is the one it was switched on under, in any case and spacing', () => {
    assert.ok(cleared(at(rows('conditional', 'history off'), [sw('Internal', ' History Off ')])));
  });

  test('dropped when the note’s condition differs, and the refusal says the condition changed', () => {
    const r = rows('conditional', 'history off and logging off');
    assert.match(at(r, [sw('Internal', 'history off')]).refused, /condition has changed/);
    assert.deepEqual(
      [grant(r, [sw('Internal', 'history off')]).on, grant(r, [sw('Internal', 'history off')]).changed],
      [false, true],
    );
  });

  test('dropped when the cell is no longer conditional: a yes needs none, a no stays no', () => {
    assert.equal(grant(rows('yes'), [sw('Internal', 'x')]).on, false);
    assert.ok(cleared(at(rows('yes'), [sw('Internal', 'x')])));
    assert.ok('refused' in at(rows('no'), [sw('Internal', 'x')]));
    assert.ok('refused' in at(rows('unknown'), [sw('Internal', 'x')]));
  });

  test('a conditional class with no condition cannot be switched on', () => {
    assert.match(at(rows('conditional'), [sw('Internal', '')]).refused, /no condition/);
  });
});

describe('matching is exact about what a name is', () => {
  test('a compatibility character, such as the Kelvin sign or a full-width letter, never matches', () => {
    assert.equal(matchClass('k', ['K'], {}), 'K');
    assert.equal(matchClass('K', ['K'], {}), null);
    assert.equal(matchClass('Ｐublic', LEVELS, {}), null);
    assert.deepEqual(unmatchedClasses([{ name: 'R', cells: [cell('K', 'yes')] }], ['K'], {}), ['K']);
  });

  test('keys of the table that differ only in case are flagged, and ambiguous when they disagree', () => {
    const split = { Open: 'Public', open: 'Internal' };
    assert.equal(matchClass('Open', LEVELS, split), null);
    assert.equal(matchClass('OPEN', LEVELS, split), null);
    assert.ok(classMapProblems(LEVELS, split).some((p) => inOrder(p, 'Open', 'open')));
    const agree = { Open: 'Public', open: 'public' };
    assert.equal(matchClass('Open', LEVELS, agree), 'Public');
    assert.equal(classMapProblems(LEVELS, agree).length, 1);
    assert.deepEqual(classMapProblems(LEVELS, { Open: 'Public' }), []);
  });

  test('a table entry that conflicts with a name match is flagged, and the name is not used', () => {
    const clash = { Public: 'Internal' };
    assert.equal(matchClass('Public', LEVELS, clash), null);
    assert.ok(classMapProblems(LEVELS, clash).some((p) => inOrder(p, 'Public', 'Internal')));
    assert.equal(matchClass('Public', LEVELS, { Public: 'public' }), 'Public');
  });
});
