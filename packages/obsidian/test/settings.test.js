// The settings page (editor spec §21): one page in Obsidian's plugin settings holding every option with its sentence;
// strictness at three levels, read as stated wherever a graph is read; one action converting a note back to standard
// GQL, checked first; engines and exports given standard GQL; the AI models of §19, their keys kept out of the vault; and
// formatting and drawing defaults.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { open, note } from './host/pane-notes.js';

before(() => build());

// a missing comma on line 2: read as meant, and a departure from standard GQL
const SLIP = "// graph: g\n(a:T {text: 'A'})\n(b:T {text: 'B'})";
const PATH = 'Slip.md';
const NOTE = `# Slip\n\n${fence(SLIP)}\n`;

/** The settings page as Obsidian shows it: the plugin's one tab, displayed. */
function page(env) {
  assert.equal(env.state.settingTabs.length, 1, 'one settings page');
  const tab = env.state.settingTabs[0];
  tab.display();
  return tab.containerEl;
}
/** A row of the page by its name, or, with `heading`, a part of the page by its heading. */
const row = (el, name, heading = false) =>
  el
    .querySelectorAll('.setting-item')
    .find(
      (r) =>
        r.classList.contains('setting-item-heading') === heading &&
        r.querySelector('.setting-item-name')?.textContent === name,
    );
const choose = (r, value) => {
  const sel = r.querySelector('select');
  sel.value = value;
  sel.dispatch('change');
};
/** The problems behind a drawing's badge, each as its sign and severity. */
async function problemsShown(env) {
  const { el } = await show(env, NOTE);
  el.querySelector('.graph-note-badge').click();
  return el
    .querySelectorAll('li')
    .map((li) => li.className)
    .filter((c) => /^is-/.test(c));
}

describe('the settings page', () => {
  test('is one page, in the plugin settings, holding every option with a sentence saying what it does', async () => {
    const env = await load();
    try {
      const el = page(env);
      const { OPTIONS } = await import('../../core/src/settings.ts');
      for (const o of OPTIONS) {
        const r = row(el, o.name);
        assert.ok(r, `${o.name} is on the page`);
        assert.match(r.querySelector('.setting-item-description').textContent, new RegExp(o.sentence.slice(0, 20)));
      }
      for (const part of ['Strictness', 'AI models', 'Formatting', 'Drawing']) assert.ok(row(el, part, true), part);
    } finally {
      env.uninstall();
    }
  });

  test('a choice made on the page is saved, and read back when the plugin loads again', async () => {
    const env = await load();
    let data;
    try {
      choose(row(page(env), 'Strictness'), 'standard');
      await wait(10);
      data = env.state.data;
      assert.equal(data.settings.strictness, 'standard');
    } finally {
      env.uninstall();
    }
    const again = await load({ data });
    try {
      assert.equal(again.plugin.settings.strictness, 'standard');
      assert.equal(row(page(again), 'Strictness').querySelector('select').value, 'standard');
    } finally {
      again.uninstall();
    }
  });
});

describe('strictness', () => {
  test('Forgiving, the default: a slip is drawn, and reported as a warning', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      assert.deepEqual(await problemsShown(env), ['is-warning']);
    } finally {
      env.uninstall();
    }
  });

  test('Standard: every departure from standard GQL is an error', async () => {
    const env = await load({ files: { [PATH]: NOTE }, data: { settings: { strictness: 'standard' } } });
    try {
      assert.deepEqual(await problemsShown(env), ['is-error']);
    } finally {
      env.uninstall();
    }
  });

  test('Simplified: a departure chosen on the page is allowed as written, and one not chosen is still reported', async () => {
    const env = await load({ files: { [PATH]: NOTE }, data: { settings: { strictness: 'simplified' } } });
    try {
      assert.deepEqual(await problemsShown(env), ['is-warning'], 'nothing is allowed until chosen');
      const r = row(page(env), 'A missing comma');
      const t = r.querySelector('input');
      t.checked = true;
      t.dispatch('change');
      await wait(10);
      assert.deepEqual(env.state.data.settings.allowed, ['missing-comma']);
      assert.deepEqual(await problemsShown(env), []);
    } finally {
      env.uninstall();
    }
  });

  test('a level chosen on the page redraws a drawing already shown, without the note being opened again', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await show(env, NOTE);
      const shown = () =>
        el
          .querySelectorAll('li')
          .map((li) => li.className)
          .filter((c) => /^is-/.test(c));
      assert.deepEqual(shown(), ['is-warning']);
      choose(row(page(env), 'Strictness'), 'standard');
      await until(() => shown()[0] === 'is-error');
      assert.deepEqual(shown(), ['is-error']);
    } finally {
      env.uninstall();
    }
  });

  test('a level chosen on the page reaches an edit pane already open', async () => {
    const typed = "// graph: reader\n(x:T {text: 'X'})\n(y:T {text: 'Y'})";
    const env = await open();
    try {
      const t = env.el.querySelector('textarea');
      t.value = typed;
      t.dispatch('input');
      await wait(400);
      const mark = () => env.el.querySelector('.graph-note-problems li, .graph-note-problem')?.className ?? '';
      assert.match(mark(), /is-warning/);
      choose(row(page(env), 'Strictness'), 'standard');
      await until(() => /is-error/.test(mark()));
    } finally {
      env.uninstall();
    }
  });

  test('the edit pane reads by the same level', async () => {
    const typed = "// graph: reader\n(x:T {text: 'X'})\n(y:T {text: 'Y'})";
    const env = await open({ data: { settings: { strictness: 'standard' } } });
    try {
      const t = env.el.querySelector('textarea');
      t.value = typed;
      t.dispatch('input');
      await wait(400);
      const mark = env.el.querySelector('.graph-note-problems li, .graph-note-problem');
      assert.ok(mark, 'the pane lists the slip');
      assert.match(mark.className, /is-error/);
    } finally {
      env.uninstall();
    }
  });
});

describe('back to standard GQL', () => {
  const command = (env) => env.state.commands.find((c) => c.id === 'convert-to-standard');

  test('one action converts the note in front back to standard GQL', async () => {
    const env = await load({ files: { [PATH]: NOTE }, data: { settings: { strictness: 'simplified' } } });
    try {
      env.state.active = PATH;
      assert.match(command(env).name, /standard GQL/);
      await command(env).callback();
      assert.equal(env.state.files.get(PATH), NOTE.replace("(a:T {text: 'A'})\n", "(a:T {text: 'A'}),\n"));
      assert.match(env.state.notices.at(-1), /1 departure/);
    } finally {
      env.uninstall();
    }
  });

  test('a note the standard checker would refuse is left as it is, and the notice says why', async () => {
    const broken = `# Broken\n\n${fence("// graph: g\n(a:T {text: 'A'})\n(b:T {text: })")}\n`;
    const env = await load({ files: { [PATH]: broken } });
    try {
      env.state.active = PATH;
      await command(env).callback();
      assert.equal(env.state.files.get(PATH), broken);
      assert.match(env.state.notices.at(-1), /cannot be made standard/);
    } finally {
      env.uninstall();
    }
  });

  test('the button on the settings page converts the note in front, as the command does', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      env.state.active = PATH;
      labelled(row(page(env), 'Convert to standard GQL'), 'Convert to standard GQL').click();
      await until(() => env.state.files.get(PATH) !== NOTE);
      assert.equal(env.state.files.get(PATH), NOTE.replace("(a:T {text: 'A'})\n", "(a:T {text: 'A'}),\n"));
    } finally {
      env.uninstall();
    }
  });

  test('a note that changes between the check and the write is not converted, and never said to be', async () => {
    const broken = `# Broken\n\n${fence("// graph: g\n(a:T {text: 'A'})\n(b:T {text: })")}\n`;
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      env.state.active = PATH;
      const process = env.app.vault.process;
      env.app.vault.process = (f, fn) => {
        env.state.files.set(PATH, broken); // written meanwhile, elsewhere
        return process(f, fn);
      };
      await command(env).callback();
      assert.equal(env.state.files.get(PATH), broken);
      assert.match(env.state.notices.at(-1), /Not converted/);
      assert.doesNotMatch(env.state.notices.join('\n'), /Converted/);
    } finally {
      env.uninstall();
    }
  });

  test('whatever the level, what an engine or an export is given is standard GQL', async () => {
    const want = [SLIP.replace("(a:T {text: 'A'})\n", "(a:T {text: 'A'}),\n")];
    for (const strictness of ['standard', 'forgiving', 'simplified']) {
      const env = await load({
        files: { [PATH]: NOTE },
        data: { settings: { strictness, allowed: ['missing-comma'] } },
      });
      try {
        assert.deepEqual(await env.plugin.standardGql(PATH), want, strictness);
      } finally {
        env.uninstall();
      }
    }
  });
});

describe('the AI models of §19', () => {
  test('a model is set up on the page with its name, purpose and ceiling, chosen among the classifications', async () => {
    const env = await load();
    try {
      let el = page(env);
      labelled(el, 'Add a model').click();
      await wait(10);
      el = page(env);
      const r = row(el, 'Model 1');
      assert.ok(r);
      const [name, purpose] = r.querySelectorAll('input');
      name.value = 'Drafts';
      name.dispatch('input');
      purpose.value = 'Suggest links';
      purpose.dispatch('input');
      const ceiling = r.querySelector('select');
      assert.deepEqual(
        ceiling.querySelectorAll('option').map((o) => o.getAttribute('value')),
        env.plugin.settings.classifications,
      );
      ceiling.value = 'Internal';
      ceiling.dispatch('change');
      await wait(10);
      assert.deepEqual(
        [
          env.state.data.settings.aiModels[0].name,
          env.state.data.settings.aiModels[0].purpose,
          env.state.data.settings.aiModels[0].ceiling,
        ],
        ['Drafts', 'Suggest links', 'Internal'],
      );
    } finally {
      env.uninstall();
    }
  });

  test('typing in the classifications keeps each ceiling, and the field, while a word is retyped', async () => {
    const env = await load({
      data: { settings: { classifications: ['Public', 'Internal'], aiModels: [{ name: 'A', ceiling: 'Internal' }] } },
    });
    try {
      const el = page(env);
      const field = row(el, 'Classifications').querySelector('textarea');
      for (const v of ['Public\nInterna', 'Public\nIntern', 'Public\nInternal']) {
        field.value = v;
        field.dispatch('input');
        await wait(5);
      }
      assert.ok(row(el, 'Classifications').querySelector('textarea') === field, 'the page is not drawn again under it');
      assert.equal(env.state.data.settings.aiModels[0].ceiling, 'Internal');
      assert.deepEqual(env.state.data.settings.classifications, ['Public', 'Internal']);
    } finally {
      env.uninstall();
    }
  });

  test('its key is kept in the app’s secret store by name, and never reaches the vault', async () => {
    const env = await load({ data: { settings: { aiModels: [{ name: 'Drafts' }] } } });
    try {
      const el = page(env);
      row(el, 'Model 1').querySelector('.fake-secret').secretComponent.enter('graph-note-drafts', 'sk-not-in-vault');
      await wait(10);
      assert.equal(env.state.data.settings.aiModels[0].keyName, 'graph-note-drafts');
      assert.equal(env.app.secretStorage.getSecret('graph-note-drafts'), 'sk-not-in-vault');
      assert.doesNotMatch(JSON.stringify(env.state.data), /sk-not-in-vault/);
    } finally {
      env.uninstall();
    }
  });
});

describe('formatting and drawing defaults', () => {
  test('Lock writes the schema with the indent chosen on the page', async () => {
    const env = await open({ data: { settings: { indent: 'two' } } });
    try {
      labelled(env.el, 'Lock the graph').click();
      await wait(50);
      assert.match(note(env), /\n {2}graph: 'reader'/);
      assert.doesNotMatch(note(env), /\n {4}graph: 'reader'/);
    } finally {
      env.uninstall();
    }
  });

  test('a drawing runs in the direction chosen, one the locked style allows', async () => {
    const env = await load({ data: { settings: { direction: 'TB' } } });
    try {
      const drawn = await env.plugin.layout({
        graph: 'g',
        boxes: [
          { key: 'a', kind: 'T', text: 'A' },
          { key: 'b', kind: 'T', text: 'B' },
        ],
        links: [{ from: 'a', type: 'R', reading: 'r', to: 'b' }],
        estimates: [],
      });
      assert.equal(drawn.rankdir, 'TB');
      const options = row(page(env), 'Direction')
        .querySelectorAll('option')
        .map((o) => o.getAttribute('value'));
      assert.deepEqual(options, ['best', 'LR', 'TB']);
    } finally {
      env.uninstall();
    }
  });
});
