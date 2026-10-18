// Things parked for later in a drawing (editor spec §5, park_for_later, deferred_drawn; §8, parked_not_broken): a thing
// a Deferred defers is drawn dashed with a later mark, said so to screen readers; the badge counts parked things apart
// from problems, and those past their revisit date as overdue; and, while the card is edited, its details offer Park for
// later, which writes a Deferred saying what is needed and why it waits.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, show } from './host/card-notes.js';
import { styles } from './host/view-notes.js';
import { tapKey, text } from './host/inspector-steps.js';

before(() => build());

const PLAIN = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(q)`;
const PARKED = `${PLAIN},
(later_small:Deferred {what: 'its price', why: 'the shop has not said', revisit_by: DATE '2999-01-01'}),
(later_small)-[:DEFERS]->(small)`;
const OVERDUE = PARKED.replace("'2999-01-01'", "'2000-01-01'");
// a locked graph: its schema declares what its data uses, and not Deferred and DEFERS (the graph library's §5)
const LOCKED = `${PLAIN},
(reader_schema:GraphMeta {graph: 'reader', schema: 'reader@1'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source', reading: 'answers', reverse_name: 'is answered by'}),
(reader_schema)-[:DECLARES]->(kind_option),
(reader_schema)-[:DECLARES]->(kind_question),
(reader_schema)-[:DECLARES]->(link_answers)`;
const SCHEMA_BLOCK = `// graph: reader\n${LOCKED.slice(PLAIN.length + 2)}`;
const DECLARE = 'Declare Deferred and DEFERS in the schema';
const noteOf = (block) => ['# Reader', '', fence(block), ''].join('\n');
const nodeOf = (el, key) => el.querySelectorAll('g.node').find((n) => n.getAttribute('data-key') === key);

describe('a thing parked for later, drawn', () => {
  test('is drawn dashed, with a later mark on the drawing, and said so to screen readers', async () => {
    const env = await load({ files: { [PATH]: noteOf(PARKED) } });
    try {
      const el = await show(env);
      const g = nodeOf(el, 'small');
      assert.ok(g.classList.contains('thoughtknot-parked'), 'marked as parked');
      assert.ok(
        g.querySelectorAll('text').some((t) => /⏳ later/.test(t.textContent)),
        'a later mark, in words as well as a sign',
      );
      assert.match(g.getAttribute('aria-label'), /parked for later: its price/i);
      assert.ok(!nodeOf(el, 'large').classList.contains('thoughtknot-parked'), 'only the thing parked');
      assert.match(styles, /\.thoughtknot-parked\s+(?:path|polygon)[^{]*\{[^}]*stroke-dasharray/);
    } finally {
      env.uninstall();
    }
  });

  test('past its revisit date it is marked overdue, in words', async () => {
    const env = await load({ files: { [PATH]: noteOf(OVERDUE) } });
    try {
      const el = await show(env);
      const g = nodeOf(el, 'small');
      assert.ok(g.classList.contains('is-overdue'));
      assert.ok(g.querySelectorAll('text').some((t) => /⏳ overdue/.test(t.textContent)));
    } finally {
      env.uninstall();
    }
  });
});

describe('the badge', () => {
  test('counts things parked for later apart from problems', async () => {
    const env = await load({ files: { [PATH]: noteOf(PARKED) } });
    try {
      const el = await show(env);
      const badge = el.querySelector('.thoughtknot-badge');
      assert.match(badge.getAttribute('aria-label'), /^No problems, 1 parked$/);
    } finally {
      env.uninstall();
    }
  });

  test('says how many parked things are overdue, and lists them behind it', async () => {
    const env = await load({ files: { [PATH]: noteOf(OVERDUE) } });
    try {
      const el = await show(env);
      const badge = el.querySelector('.thoughtknot-badge');
      assert.match(badge.getAttribute('aria-label'), /^No problems, 1 parked, 1 overdue$/);
      const items = el.querySelectorAll('li').map((li) => li.textContent);
      assert.ok(
        items.some((t) => /Small reader/.test(t) && /overdue/i.test(t) && /its price/.test(t)),
        items.join(' | '),
      );
    } finally {
      env.uninstall();
    }
  });

  test('with nothing parked, says nothing of parking', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      assert.equal(el.querySelector('.thoughtknot-badge').getAttribute('aria-label'), 'No problems');
    } finally {
      env.uninstall();
    }
  });
});

describe('Park for later, while the card is edited', () => {
  test('writes a Deferred saying what is needed and why it waits', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'small');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      const input = (name) => el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === name);
      input('What is needed').value = 'its price';
      input('Why it waits').value = 'the shop has not said';
      input('Revisit by').value = '2999-01-01';
      labelled(el, 'Park it').click();
      await until(() => /:Deferred/.test(text(el)));
      assert.match(text(el), /\(later_small:Deferred \{\s*what: 'its price',\s*why: 'the shop has not said'/);
      assert.match(text(el), /\(later_small\)-\[:DEFERS\]->\(small\)/);
      await until(() => /:Deferred/.test(env.state.files.get(PATH)), 3000);
    } finally {
      env.uninstall();
    }
  });

  test('the form takes the focus to its first field, and its fields and buttons are big enough to touch', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'small');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      const first = el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === 'What is needed');
      assert.ok(env.doc.activeElement === first);
      assert.match(styles, /\.thoughtknot-park :is\(button, input\)\s*\{[^}]*min-height:\s*44px/);
    } finally {
      env.uninstall();
    }
  });

  test('a thing written in another block of its graph is parked from this one', async () => {
    const two = [
      '# Reader',
      '',
      fence(PLAIN),
      '',
      fence("// graph: reader\n(tiny:Option {name: 'Tiny reader'})"),
      '',
    ].join('\n');
    const env = await load({ files: { [PATH]: two } });
    try {
      // the second block, whose card draws the whole graph so far
      const { show: showBlock } = await import('./host/view-notes.js');
      const { el } = await showBlock(env, two, 1);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'small');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      const input = (name) => el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === name);
      input('What is needed').value = 'its price';
      input('Why it waits').value = 'not said';
      labelled(el, 'Park it').click();
      await until(() => /:Deferred/.test(text(el)));
      assert.match(text(el), /-\[:DEFERS\]->\(small\)/);
    } finally {
      env.uninstall();
    }
  });

  test('without what is needed and why, writes nothing and says what is missing', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'small');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      labelled(el, 'Park it').click();
      await wait(50);
      assert.doesNotMatch(text(el), /Deferred/);
      assert.match(el.querySelector('.thoughtknot-park [role="alert"]').textContent, /what is needed/i);
    } finally {
      env.uninstall();
    }
  });

  test('a refusal for any other reason offers no declaration', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'small');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      labelled(el, 'Park it').click();
      await wait(50);
      assert.equal(labelled(el, DECLARE), undefined);
    } finally {
      env.uninstall();
    }
  });

  test('is offered only while the card is edited: reading a drawing never changes it', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      tapKey(el, 'small');
      await until(() => !!labelled(el, 'Close details')); // its details shown, with all they offer
      assert.equal(labelled(el, 'Park for later'), undefined);
    } finally {
      env.uninstall();
    }
  });
});

// Roger, 11 Oct 2026: parking in a locked graph is refused unless its schema declares Deferred and DEFERS; the refusal
// offers a button that writes the two declarations into the schema, and then parks the thing with what was typed
describe('Park for later, in a locked graph whose schema does not declare Deferred and DEFERS', () => {
  const input = (el, name) => el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === name);
  /** Edit here, tap the small reader, fill the Park for later form and press Park it; the form is left open. */
  async function parkIt(el) {
    labelled(el, 'Edit here').click();
    await until(() => !!el.querySelector('textarea'));
    tapKey(el, 'small');
    await until(() => !!labelled(el, 'Park for later'));
    labelled(el, 'Park for later').click();
    input(el, 'What is needed').value = 'its price';
    input(el, 'Why it waits').value = 'the shop has not said';
    input(el, 'Revisit by').value = '2999-01-01';
    labelled(el, 'Park it').click();
    await wait(50);
  }
  const alertOf = (el) => el.querySelector('.thoughtknot-park [role="alert"]').textContent;
  /** The card of the note's first block drawn again, as Obsidian does once the note has changed: its badge. */
  const badgeOf = async (env) => (await show(env)).querySelector('.thoughtknot-badge').getAttribute('aria-label');

  test('with the schema in the block being edited, it declares them there and parks, keeping what was typed', async () => {
    const env = await load({ files: { [PATH]: noteOf(LOCKED) } });
    try {
      const el = await show(env);
      await parkIt(el);
      assert.match(alertOf(el), /locked.*does not declare Deferred and DEFERS: declare them in the schema first/);
      assert.doesNotMatch(text(el), /Deferred/, 'nothing is written by the refusal');
      labelled(el, DECLARE).click();
      await until(() => /later_small:Deferred/.test(text(el)));
      assert.match(text(el), /\(kind_deferred:Meta:ElementType \{\s*name: 'Deferred', kind: 'node'/);
      assert.match(
        text(el),
        /\(link_defers:Meta:ElementType \{[^}]*name: 'DEFERS', kind: 'edge'[^}]*reading: 'defers'/,
      );
      assert.match(text(el), /\(reader_schema\)-\[:DECLARES\]->\(kind_deferred\)/);
      assert.match(text(el), /\(reader_schema\)-\[:DECLARES\]->\(link_defers\)/);
      assert.match(text(el), /what: 'its price',\s*why: 'the shop has not said',\s*revisit_by: DATE '2999-01-01'/);
      assert.match(text(el), /\(later_small\)-\[:DEFERS\]->\(small\)/);
      await until(() => /later_small:Deferred/.test(env.state.files.get(PATH)), 3000);
      assert.equal(await badgeOf(env), 'No problems, 1 parked', 'the note reads with no new problem');
    } finally {
      env.uninstall();
    }
  });

  test('with the schema in a later block, it writes the declarations there through the vault and parks in this one', async () => {
    const note = ['# Reader', '', fence(PLAIN), '', fence(SCHEMA_BLOCK), ''].join('\n');
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await show(env);
      await parkIt(el);
      assert.match(alertOf(el), /does not declare Deferred and DEFERS/);
      const before = env.state.writes?.length ?? 0;
      labelled(el, DECLARE).click();
      await until(() => /kind_deferred/.test(env.state.files.get(PATH)));
      const [data, schema] = env.state.files.get(PATH).split('```gql\n').slice(1);
      assert.doesNotMatch(data, /Deferred/, 'the block being edited was not touched by the declaration');
      assert.match(
        schema,
        /\(link_defers:Meta:ElementType[\s\S]*\(reader_schema\)-\[:DECLARES\]->\(link_defers\)\n```/,
      );
      assert.ok((env.state.writes?.length ?? 0) > before, 'written through vault.process');
      await until(() => /later_small:Deferred/.test(text(el)));
      assert.doesNotMatch(text(el), /kind_deferred/, 'the declarations are in the schema block, not in this one');
      assert.match(text(el), /what: 'its price',\s*why: 'the shop has not said'/);
      // what is typed is written after its pause, and the declarations are still there
      await until(() => /:Deferred/.test(env.state.files.get(PATH).split('```gql\n')[1]), 3000);
      assert.match(env.state.files.get(PATH), /kind_deferred[\s\S]*link_defers/);
      assert.equal(await badgeOf(env), 'No problems, 1 parked', 'the note reads with no new problem');
    } finally {
      env.uninstall();
    }
  });

  const split = ['# Reader', '', fence(PLAIN), '', fence(SCHEMA_BLOCK), ''].join('\n');

  test('pressed twice at once, in either place, it parks once', async () => {
    for (const note of [noteOf(LOCKED), split]) {
      const env = await load({ files: { [PATH]: note } });
      try {
        const el = await show(env);
        await parkIt(el);
        // the vault takes its time, as it does: the second press comes while the first waits for it
        const vault = env.plugin.app.vault,
          process = vault.process.bind(vault);
        vault.process = async (f, fn) => (await wait(40), process(f, fn));
        const fix = labelled(el, DECLARE);
        fix.click();
        await wait(5);
        fix.click();
        await until(() => /later_small:Deferred/.test(text(el)));
        await wait(150);
        assert.doesNotMatch(text(el), /later_small_2/, 'parked once');
        assert.equal(text(el).split('DEFERS]->(small)').length, 2, 'one DEFERS link to the thing');
        const written = text(el) + env.state.files.get(PATH);
        assert.equal(written.split("name: 'Deferred'").length, 2, 'declared once');
      } finally {
        env.uninstall();
      }
    }
  });

  test('checks the form first: blanked after the refusal, nothing is declared, and it says what is missing', async () => {
    for (const note of [noteOf(LOCKED), split]) {
      const env = await load({ files: { [PATH]: note } });
      try {
        const el = await show(env);
        await parkIt(el);
        input(el, 'What is needed').value = '';
        labelled(el, DECLARE).click();
        await wait(100);
        assert.match(alertOf(el), /what is needed/i);
        assert.doesNotMatch(text(el), /Deferred/, 'nothing parked');
        assert.equal(env.state.files.get(PATH), note, 'and nothing declared: the note is as it was');
      } finally {
        env.uninstall();
      }
    }
  });

  test('says why when the declarations cannot be written, and writes nothing', async () => {
    // a schema block that ends with a SET cannot take another item
    const schema = `${SCHEMA_BLOCK},\nSET kind_option.origin = 'edited'`;
    const note = ['# Reader', '', fence(PLAIN), '', fence(schema), ''].join('\n');
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await show(env);
      await parkIt(el);
      labelled(el, DECLARE).click();
      await wait(50);
      assert.match(alertOf(el), /SET or MATCH/);
      assert.doesNotMatch(text(el), /Deferred/);
      assert.equal(env.state.files.get(PATH), note, 'the note is as it was');
    } finally {
      env.uninstall();
    }
  });
});
