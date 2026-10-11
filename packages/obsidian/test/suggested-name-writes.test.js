// A thing drawn under a suggested name is never written by that name unasked (editor spec §4, unnamed_drawn_suggested:
// "nothing is written until its fix is accepted"). In a card being edited, each way of writing the name into the note —
// recording a path through the box, making a view of it, parking it, changing its properties, making a list of it or
// adding to one, saving a view as shown with it selected — is refused in words ("accept its name first"), writes nothing,
// and leaves the box's own fix, Add the name, where it was; once the name is written, the same edit goes through.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fakeContext } from './host/fake-obsidian.js';
import { fence, labelled } from './host/notes.js';
import { PATH } from './host/card-notes.js';
import { show as showView } from './host/view-notes.js';
import { editing, tapKey, text, field, enter, pick, addChip } from './host/inspector-steps.js';

before(() => build());

const BLOCK = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(:Option {name: 'Small reader', tags: 'light'}),
(large)-[:ANSWERS]->(q)`;
const NAMED = BLOCK.replace('(:Option', '(small_reader:Option');
// the thing already holds a list, linked by the name it is drawn under
const LISTED = `${BLOCK.replace(", tags: 'light'", '')},
(small_reader)-[:HAS_TAG]->(light:Tag),
(small_reader)-[:HAS_TAG]->(cheap:Tag)`;
const noteOf = (block, ...more) =>
  ['# Reader', '', fence(block), ...more.flatMap((b) => ['', fence(b)]), ''].join('\n');
const FIRST = /^accept its name first: Small reader is only drawn under the suggested name small_reader/;
const FIX = 'Add the name small_reader';
const details = (el) => el.querySelector('.graph-note-details');

/** The note as written, and the field's text, both as they were: nothing was written. */
const unwritten = (env, el, block = BLOCK) => {
  assert.equal(text(el), block, 'the text is as it was');
  assert.equal(env.state.files.get(PATH), noteOf(block), 'the note is as it was');
};

async function open(block = BLOCK) {
  const env = await load({ files: { [PATH]: noteOf(block) } });
  const el = await editing(env);
  return { env, el };
}

describe('recording a path through a box drawn under a suggested name', () => {
  const record = async (el, ...keys) => {
    await until(() => !!labelled(el, 'Record a path'));
    labelled(el, 'Record a path').click();
    for (const k of keys) tapKey(el, k);
    el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === 'Path title').value = 'Coffee first';
    labelled(el, 'Save path').click();
  };
  const alert = (el) => el.querySelector('.graph-note-walk [role="alert"]');

  test('is refused in words, and nothing is written; the recording is kept', async () => {
    const { env, el } = await open();
    try {
      await record(el, 'large', 'small_reader');
      assert.match(alert(el).textContent, FIRST);
      unwritten(env, el);
      assert.ok(labelled(el, 'Save path'), 'still recording, so the name can be accepted and the path saved');
    } finally {
      env.uninstall();
    }
  });
});

describe('making a view of a box drawn under a suggested name', () => {
  const make = async (el, kind, ...keys) => {
    await until(() => !!labelled(el, 'Make a view'));
    labelled(el, 'Make a view').click();
    const strip = el.querySelector('.graph-note-view-maker');
    const kinds = strip.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === 'Kind of view');
    kinds.value = kind;
    kinds.dispatch('change');
    for (const k of keys) tapKey(el, k);
    strip.querySelectorAll('input').find((i) => i.getAttribute('aria-label') === 'View name').value = 'mine';
    labelled(el, 'Write the view').click();
    return strip;
  };

  for (const [kind, keys] of [
    ['picked', ['large', 'small_reader']],
    ['near', ['small_reader']],
    ['reaches', ['large', 'small_reader']],
  ]) {
    test(`a view of kind ${kind} is refused in words, and no view block is written`, async () => {
      const { env, el } = await open();
      try {
        const strip = await make(el, kind, ...keys);
        // refused as it is written, against the note as it is then
        await until(() => FIRST.test(strip.querySelector('[role="alert"]').textContent));
        unwritten(env, el);
        assert.doesNotMatch(env.state.files.get(PATH), /QUERY view/);
      } finally {
        env.uninstall();
      }
    });
  }

  test('a view of only some kinds names no box, so it is written', async () => {
    const { env, el } = await open();
    try {
      await make(el, 'kinds', 'small_reader');
      await until(() => /QUERY view mine/.test(env.state.files.get(PATH)));
    } finally {
      env.uninstall();
    }
  });
});

describe('the details of a box drawn under a suggested name, while the card is edited', () => {
  test('Park for later is refused in words, and nothing is written; the fix to accept the name is there', async () => {
    const { env, el } = await open();
    try {
      tapKey(el, 'small_reader');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      const input = (name) => el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === name);
      input('What is needed').value = 'its price';
      input('Why it waits').value = 'the shop has not said';
      labelled(el, 'Park it').click();
      assert.match(el.querySelector('.graph-note-park [role="alert"]').textContent, FIRST);
      unwritten(env, el);
      assert.ok(labelled(details(el), FIX), 'the box’s own fix is still offered');
    } finally {
      env.uninstall();
    }
  });

  test('a property changed, added or renamed is refused in words, and nothing is written', async () => {
    const { env, el } = await open();
    try {
      tapKey(el, 'small_reader');
      const panel = details(el);
      const alert = () => panel.querySelector('.graph-note-inspector [role="alert"]');
      enter(field(panel, 'Value of name'), 'Little reader');
      assert.match(alert().textContent, /^name: accept its name first: Small reader is only drawn/);
      unwritten(env, el);
      enter(field(panel, 'Name of name'), 'title');
      assert.match(alert().textContent, /^name: accept its name first/);
      unwritten(env, el);
      pick(env, panel, 'tags', 'Remove');
      assert.match(alert().textContent, /^tags: accept its name first/);
      unwritten(env, el);
    } finally {
      env.uninstall();
    }
  });

  test('making a property a list is refused in words, and nothing is written', async () => {
    const { env, el } = await open();
    try {
      tapKey(el, 'small_reader');
      const panel = details(el);
      pick(env, panel, 'tags', 'List');
      enter(field(panel, 'Kind of the linked things'), 'Tag');
      enter(field(panel, 'Relationship from this thing'), 'HAS_TAG');
      labelled(panel, 'Make list').click();
      assert.match(panel.querySelector('[role="alert"]').textContent, /accept its name first: Small reader is only/);
      unwritten(env, el);
    } finally {
      env.uninstall();
    }
  });

  test('adding to a list it holds is refused in words, and nothing is written', async () => {
    const { env, el } = await open(LISTED);
    try {
      tapKey(el, 'small_reader');
      const panel = details(el);
      addChip(panel, 'HAS_TAG', 'thin');
      assert.match(panel.querySelector('[role="alert"]').textContent, /accept its name first: Small reader is only/);
      unwritten(env, el, LISTED);
    } finally {
      env.uninstall();
    }
  });

  test('once its name is written, the same property is changed', async () => {
    const { env, el } = await open(NAMED);
    try {
      tapKey(el, 'small_reader');
      enter(field(details(el), 'Value of name'), 'Little reader');
      assert.match(text(el), /\(small_reader:Option \{name: 'Little reader'/);
    } finally {
      env.uninstall();
    }
  });
});

// Review, 11 Oct 2026: a card's drawing can be older than the note, as when another block of its graph is changed and the
// card is not drawn again. An edit written into the block is checked against the note as it is now, with what is typed.
describe('a card drawn before another block of its graph was changed', () => {
  // B writes small_reader, so A's thing was drawn as small_reader_2; once B's thing is renamed, A's is small_reader
  const B = "// graph: reader\n(small_reader:Option {name: 'Other'}),\n(small_reader)-[:HAS_TAG]->(light:Tag)";
  const RENAMED = B.replaceAll('small_reader', 'other');
  const A = "// graph: reader\n(large:Option {name: 'Large reader'}),\n(:Option {name: 'Small reader'})";
  const NOW = /accept its name first: Small reader is only drawn under the suggested name small_reader,/;

  /** A's card, drawn while the block before it was `before`, and opened for editing; then that block becomes `after`. */
  async function staleCard(before = B, after = RENAMED) {
    const note = noteOf(before, A);
    const env = await load({ files: { [PATH]: note } });
    const el = env.doc.body.createDiv();
    await env.state.processors.get('gql')(A, el, fakeContext(note, note.split('\n').lastIndexOf('```gql')));
    labelled(el, 'Edit here').click();
    await until(() => !!el.querySelector('textarea'));
    await env.app.vault.modify(env.app.vault.getAbstractFileByPath(PATH), noteOf(after, A));
    await wait(50);
    return { env, el };
  }
  const written = (env, el) => {
    assert.equal(text(el), A, 'the text is as it was');
    assert.equal(env.state.files.get(PATH), noteOf(RENAMED, A), 'the note is as it was');
  };

  test('Park for later is refused for the thing now only suggested, and nothing is written', async () => {
    const { env, el } = await staleCard();
    try {
      tapKey(el, 'small_reader');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      field(el, 'What is needed').value = 'its price';
      field(el, 'Why it waits').value = 'the shop has not said';
      labelled(el, 'Park it').click();
      assert.match(el.querySelector('.graph-note-park [role="alert"]').textContent, NOW);
      written(env, el);
    } finally {
      env.uninstall();
    }
  });

  test('a path through it is refused, and nothing is written', async () => {
    const { env, el } = await staleCard();
    try {
      await until(() => !!labelled(el, 'Record a path'));
      labelled(el, 'Record a path').click();
      for (const k of ['large', 'small_reader']) tapKey(el, k);
      field(el, 'Path title').value = 'Coffee first';
      labelled(el, 'Save path').click();
      assert.match(el.querySelector('.graph-note-walk [role="alert"]').textContent, NOW);
      written(env, el);
    } finally {
      env.uninstall();
    }
  });

  test('a value added to a list it holds is refused, and nothing is written', async () => {
    const { env, el } = await staleCard();
    try {
      tapKey(el, 'small_reader');
      const panel = details(el);
      addChip(panel, 'HAS_TAG', 'thin');
      assert.match(panel.querySelector('[role="alert"]').textContent, NOW);
      written(env, el);
    } finally {
      env.uninstall();
    }
  });

  test('Add the name writes the name the note now suggests, never the one the card drew', async () => {
    // drawn while A's thing was small_reader; then B writes small_reader, so A's thing is small_reader_2
    const { env, el } = await staleCard(RENAMED, B);
    try {
      tapKey(el, 'small_reader');
      await until(() => !!labelled(details(el), 'Add the name small_reader_2'));
      labelled(details(el), 'Add the name small_reader_2').click();
      assert.equal(text(el), A.replace('(:Option', '(small_reader_2:Option'));
    } finally {
      env.uninstall();
    }
  });

  // the merge with #91: an edit the note refuses as it is written is kept through the drafts kept by id, as typing is
  test('an edit the note refuses as written is kept as its own draft, by id, and Discard takes only that one', async () => {
    const theirs = { text: 'another editor’s draft', kept: '2026-10-10T08:00:00.000Z', id: 'theirs' };
    const note = noteOf(RENAMED, A);
    const env = await load({ files: { [PATH]: note }, data: { drafts: { [`${PATH}#reader`]: theirs } } });
    try {
      const el = env.doc.body.createDiv();
      await env.state.processors.get('gql')(A, el, fakeContext(note, note.split('\n').lastIndexOf('```gql')));
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'small_reader');
      await until(() => !!labelled(details(el), 'Add the name small_reader'));
      labelled(details(el), 'Add the name small_reader').click();
      const named = A.replace('(:Option', '(small_reader:Option');
      assert.equal(text(el), named);
      // before it is written, another block takes the name: the note refuses the edit as it is written
      await env.app.vault.modify(env.app.vault.getAbstractFileByPath(PATH), noteOf(B, A));
      const said = () => el.querySelectorAll('p').find((p) => /^The edit was not written/.test(p.textContent));
      await until(() => !!said());
      assert.match(said().textContent, /small_reader is already a name in graph reader: choose another/);
      assert.equal(text(el), A, 'the block as the note has it');
      assert.equal(env.state.files.get(PATH), noteOf(B, A), 'nothing was written');
      const mine = Object.values(env.state.data.drafts).find((d) => d.text === named);
      assert.ok(mine?.id && mine.id !== 'theirs', 'kept as its own draft, with an id of its own');
      labelled(el, 'Discard draft').click();
      await until(() => !Object.values(env.state.data.drafts).some((d) => d.id === mine.id));
      assert.deepEqual(
        Object.values(env.state.data.drafts).map((d) => d.id),
        ['theirs'],
        'the other draft is kept',
      );
    } finally {
      env.uninstall();
    }
  });

  test('Add a thing suggests, and writes, a name no block of the note has now', async () => {
    const TABLET = B.replaceAll('small_reader', 'tablet');
    const { env, el } = await staleCard(RENAMED, TABLET);
    try {
      await until(() => !!labelled(el, 'Add a thing'));
      labelled(el, 'Add a thing').click();
      const words = field(el, 'Text of the new thing');
      words.value = 'Tablet';
      words.dispatch('input');
      assert.equal(field(el, 'Name of the new thing').value, 'tablet_2');
      labelled(el, 'Add the thing').click();
      assert.equal(text(el), `${A},\n(tablet_2 {name: 'Tablet'})`);
    } finally {
      env.uninstall();
    }
  });
});

describe('a view saved as shown', () => {
  const VIEW = "// graph: reader · QUERY view near_large\nMATCH (n {id: 'large'})-[]-{1,1}(m) RETURN n, m";

  test('with a box drawn under a suggested name selected is refused in words, and the style is not written', async () => {
    const note = noteOf(BLOCK, VIEW);
    const env = await load({ files: { [PATH]: note } });
    try {
      const { el } = await showView(env, note, 1);
      tapKey(el, 'small_reader');
      labelled(el, 'Save as shown').click();
      await until(() => /accept its name first/.test(env.state.notices.at(-1) ?? ''));
      assert.match(env.state.notices.at(-1), /^The style could not be written: accept its name first: Small reader/);
      assert.equal(env.state.files.get(PATH), note, 'the note is as it was');
    } finally {
      env.uninstall();
    }
  });

  test('with a written box selected is saved, as ever', async () => {
    const note = noteOf(BLOCK, VIEW);
    const env = await load({ files: { [PATH]: note } });
    try {
      const { el } = await showView(env, note, 1);
      tapKey(el, 'large');
      labelled(el, 'Save as shown').click();
      await until(() => /:Shown/.test(env.state.files.get(PATH)));
      assert.match(env.state.files.get(PATH), /selected: 'large'/);
    } finally {
      env.uninstall();
    }
  });
});
