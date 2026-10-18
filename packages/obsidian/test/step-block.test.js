// A graph step in a note (editor spec §20, graph_step_io, step_inputs_checked, run_declared_only, step_output_proposal):
// its card names the step and each point it takes a graph at, with what the point takes and a choice of the note's
// graphs and views to give it; nothing runs when it is drawn, only when Run is pressed; inputs that do not fit are
// refused, saying why, with nothing written; and what it gives is written as a proposal beside the graph, the graph
// untouched. Reading view offers no Run.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { fakeContext } from './host/fake-obsidian.js';

before(() => build());

const PATH = 'Some note.md';
const TEAM = `// graph: team
(ada:Person {name: 'Ada'}),
(bob:Person {name: 'Bob'}),
(atlas:Project {name: 'Atlas'}),
(ada)-[:WORKS_ON]->(atlas), (bob)-[:WORKS_ON]->(atlas)`;
const ONLY = '// graph: team · QUERY view people_only\nMATCH (n:Person) RETURN n';
const STEP = `// graph: team · QUERY step colleagues
// takes people: (:Person), (:Project), [:WORKS_ON]
MATCH (a:Person)-[:WORKS_ON]->(p:Project)<-[:WORKS_ON]-(b:Person)
INSERT (a)-[:WORKS_WITH]->(b)`;
const note = ['# Team', '', fence(TEAM), '', fence(ONLY), '', fence(STEP), ''].join('\n');

async function stepCard() {
  const env = await load({ files: { [PATH]: note } });
  const { el } = await show(env, note, 2);
  return { env, el };
}

describe('a step’s card', () => {
  // proves: graph_step_io
  test('names the step, each point with what it takes, and offers the note’s graphs and views to give it', async () => {
    const { env, el } = await stepCard();
    try {
      const card = el.querySelector('.thoughtknot-step');
      assert.match(card.textContent, /Step colleagues proposes links into team/);
      assert.match(card.textContent, /people takes \(:Person\), \(:Project\) and \[:WORKS_ON\]/);
      const choice = card.querySelector('select');
      assert.equal(choice.getAttribute('aria-label'), 'Give people');
      assert.deepEqual(
        choice.querySelectorAll('option').map((o) => o.textContent),
        ['graph team', 'view people_only of team'],
      );
      assert.match(el.querySelector('code').textContent, /INSERT \(a\)-\[:WORKS_WITH\]->\(b\)/);
    } finally {
      env.uninstall();
    }
  });

  // proves: run_declared_only
  test('runs nothing when it is drawn: the note is as it was until Run is pressed', async () => {
    const { env } = await stepCard();
    try {
      assert.equal(env.state.writes, undefined);
      assert.equal(env.state.files.get(PATH), note);
    } finally {
      env.uninstall();
    }
  });

  // proves: step_output_proposal
  test('Run writes what it gives as a proposal beside the graph, the graph untouched', async () => {
    const { env, el } = await stepCard();
    try {
      labelled(el, 'Run step colleagues').click();
      await until(() => (env.state.writes ?? []).length > 0);
      const now = env.state.files.get(PATH);
      assert.ok(now.includes(fence(TEAM)), 'the graph block is as it was');
      assert.match(now, /\/\/ graph: team · CHANGE SET colleagues_1/);
      assert.match(now, /\(ada\)-\[:WORKS_WITH\]->\(bob\)/);
      assert.ok(now.indexOf('CHANGE SET') < now.indexOf('QUERY view people_only'), 'beside the graph');
      assert.match(env.state.notices.at(-1), /Step colleagues proposed 2 changes to team/);
    } finally {
      env.uninstall();
    }
  });

  // proves: run_declared_only
  test('Run is off while a run is under way, so pressing it twice runs the step once', async () => {
    const { env, el } = await stepCard();
    try {
      const run = labelled(el, 'Run step colleagues');
      run.click();
      assert.equal(run.disabled, true, 'off while the run is under way');
      run.click();
      await until(() => !run.disabled);
      const now = env.state.files.get(PATH);
      assert.equal(now.split('CHANGE SET').length - 1, 1, 'one change set');
      assert.equal(env.state.writes.length, 1, 'one write');
    } finally {
      env.uninstall();
    }
  });

  // proves: graph_step_io
  test('Edit opens the step block in the pane, as an empty graph’s card does', async () => {
    const { env, el } = await stepCard();
    const opened = [];
    env.plugin.openEditor = async (target) => void opened.push(target);
    try {
      labelled(el, 'Edit').click();
      const fences = note.split('\n').flatMap((l, i) => (l === '```gql' ? [i] : []));
      assert.deepEqual(opened, [{ path: PATH, line: fences[2], graph: 'team' }]);
    } finally {
      env.uninstall();
    }
  });

  // proves: step_inputs_checked
  test('an input that does not fit its point is refused, saying why, and nothing is written', async () => {
    const { env, el } = await stepCard();
    try {
      const choice = el.querySelector('.thoughtknot-step select');
      choice.value = 'view people_only of team';
      choice.dispatch('change');
      labelled(el, 'Run step colleagues').click();
      await until(() => !!el.querySelector('.thoughtknot-step [role="alert"]'));
      const said = el.querySelector('.thoughtknot-step [role="alert"]').textContent;
      assert.match(said, /people takes \(:Project\) things, and view people_only of team holds none/);
      assert.match(said, /people takes \[:WORKS_ON\] links, and view people_only of team holds none/);
      assert.equal(env.state.writes, undefined);
    } finally {
      env.uninstall();
    }
  });

  // proves: run_declared_only
  test('a step written as code is refused where it is written, with no Run', async () => {
    const code = '// graph: team · QUERY step s\n// takes people: (:Person)\nCALL algo.pageRank()';
    const n = ['# Team', '', fence(TEAM), '', fence(code), ''].join('\n');
    const env = await load({ files: { [PATH]: n } });
    try {
      const { el } = await show(env, n, 1);
      assert.match(el.querySelector('[role="alert"]').textContent, /never calls a procedure or a named action/);
      assert.equal(labelled(el, 'Run step s'), undefined);
    } finally {
      env.uninstall();
    }
  });

  // proves: run_declared_only
  test('in reading view the step is shown, and no Run is offered', async () => {
    const env = await load({ files: { [PATH]: note } });
    try {
      const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
      const el = host
        .createDiv({ cls: 'markdown-preview-view markdown-rendered' })
        .createDiv({ cls: 'block-language-gql' });
      const fences = note.split('\n').flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
      await env.state.processors.get('gql')(STEP, el, fakeContext(note, fences[2]));
      assert.match(el.querySelector('.thoughtknot-step').textContent, /Step colleagues/);
      assert.equal(labelled(el, 'Run step colleagues'), undefined);
      assert.equal(labelled(el, 'Edit'), undefined, 'nor Edit');
    } finally {
      env.uninstall();
    }
  });
});
