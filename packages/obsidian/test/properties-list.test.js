// A list in the inspector (spec §14, list_as_linked_things): choosing List for a property asks for the kind and the
// relationship, then holds its values as things linked to this one; the inspector shows them as chips, each removed in
// place with its x, and a value is added in place — all written as text into the block being edited.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { PATH, READER, NOTE, show } from './host/card-notes.js';
import {
  editing,
  tapKey,
  text,
  field,
  row,
  enter,
  pick,
  chips,
  removeChip,
  addChip,
  makeList,
} from './host/inspector-steps.js';

before(() => build());

const TAGGED = READER.replace(
  "(large:Option {name: 'Large reader'})",
  "(large:Option {name: 'Large reader', tags: 'light, cheap'})",
);
const NOTE3 = NOTE.replace(READER, TAGGED);
/** The note with the list already made: as the block is left after choosing List. */
const LISTED = NOTE3.replace("{name: 'Large reader', tags: 'light, cheap'})", "{name: 'Large reader'})").replace(
  '(large)-[:ANSWERS]->(q)',
  '(large)-[:ANSWERS]->(q),\n(light:Tag),\n(large)-[:HAS_TAG]->(light),\n(cheap:Tag),\n(large)-[:HAS_TAG]->(cheap)',
);
const BLOCK_OF = (note) => note.split('```gql\n')[1].split('\n```')[0];
const alert = (el) => el.querySelector('.graph-note-details [role="alert"]');
const status = (el) => el.querySelector('.graph-note-details [role="status"]');

describe('choosing List in the inspector', () => {
  test('List asks for the kind and the relationship, and writes nothing until they are given', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      pick(env, panel, 'tags', 'List');
      assert.ok(field(panel, 'Kind of the linked things'));
      assert.ok(field(panel, 'Relationship from this thing'));
      assert.ok(env.doc.activeElement === field(panel, 'Kind of the linked things'), 'the Kind field has the focus');
      assert.equal(field(panel, 'Kind of the linked things').value, 'Tag', 'a kind suggested from the name');
      assert.equal(field(panel, 'Relationship from this thing').value, 'HAS_TAG');
      assert.equal(text(el), BLOCK_OF(NOTE3), 'nothing written yet');
      labelled(panel, 'Cancel').click();
      assert.ok(field(panel, 'Kind of the linked things') === undefined, 'the form goes');
      assert.ok(field(panel, 'Value of tags'), 'the property is as it was');
      assert.equal(text(el), BLOCK_OF(NOTE3));
    } finally {
      env.uninstall();
    }
  });

  test('the kind and the relationship are offered from those the graph uses', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      pick(env, panel, 'tags', 'List');
      const options = (label) =>
        panel
          .querySelector(`datalist#${field(panel, label).getAttribute('list')}`)
          .querySelectorAll('option')
          .map((o) => o.getAttribute('value'));
      assert.deepEqual(options('Kind of the linked things'), ['Option', 'Question']);
      assert.deepEqual(options('Relationship from this thing'), ['ANSWERS']);
    } finally {
      env.uninstall();
    }
  });

  test('making the list removes the property and holds each value as a linked thing, shown as chips', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      makeList(env, panel, 'tags', 'Tag', 'HAS_TAG');
      assert.equal(text(el), BLOCK_OF(LISTED));
      assert.ok(row(panel, 'tags') === null, 'the property row is gone');
      assert.deepEqual(chips(panel, 'HAS_TAG'), ['light', 'cheap']);
      assert.equal(row(panel, 'HAS_TAG').getAttribute('data-property-type'), 'list');
      await until(() => env.state.files.get(PATH).includes('(large)-[:HAS_TAG]->(cheap)'), 2000);
    } finally {
      env.uninstall();
    }
  });

  test('a kind or a relationship that is not one word is refused in the form, saying why, and nothing is written', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      makeList(env, panel, 'tags', 'Tag', 'HAS TAG');
      assert.match(alert(el).textContent, /the relationship must be one word/);
      assert.equal(text(el), BLOCK_OF(NOTE3));
      assert.ok(field(panel, 'Kind of the linked things'), 'the form stays, to be put right');
    } finally {
      env.uninstall();
    }
  });

  test('the editor’s undo takes the whole change back, to the original bytes', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      makeList(env, el.querySelector('.graph-note-details'), 'tags', 'Tag', 'HAS_TAG');
      const t = el.querySelector('textarea');
      assert.ok(t.dispatch('keydown', { key: 'z', metaKey: true }).defaultPrevented);
      assert.equal(t.value, BLOCK_OF(NOTE3));
    } finally {
      env.uninstall();
    }
  });

  test('a link’s properties cannot be a list: List is not offered', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      el.querySelectorAll('g.edge')[0].dispatch('keydown', { key: 'Enter' });
      const panel = el.querySelector('.graph-note-details');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'New property name'), 'weight');
      row(panel, '').querySelector('.metadata-property-icon').click();
      assert.equal(
        env.state.menus.at(-1).items.find((it) => it.title === 'List'),
        undefined,
      );
    } finally {
      env.uninstall();
    }
  });
});

describe('a list as chips in the inspector', () => {
  test('a thing that holds a list shows its linked things as chips, and the redrawn card keeps them', async () => {
    const env = await load({ files: { [PATH]: LISTED } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      assert.deepEqual(chips(panel, 'HAS_TAG'), ['light', 'cheap']);
      assert.ok(row(panel, 'HAS_TAG').querySelector('.multi-select-container'), 'Obsidian’s own chip classes');
      assert.deepEqual(
        panel.querySelectorAll('.metadata-property').map((r) => r.getAttribute('data-property-key')),
        ['name', 'HAS_TAG'],
        'the question it answers is a thing with a title, not a list',
      );
    } finally {
      env.uninstall();
    }
  });

  test('a chip is removed in place with its x: the link goes, and the thing when nothing else links to it', async () => {
    const env = await load({ files: { [PATH]: LISTED } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      removeChip(panel, 'HAS_TAG', 'light');
      assert.equal(text(el), BLOCK_OF(LISTED).replace('(light:Tag),\n(large)-[:HAS_TAG]->(light),\n', ''));
      assert.deepEqual(chips(panel, 'HAS_TAG'), ['cheap']);
      assert.match(status(el).textContent, /removed the link and light, which nothing else linked to/);
      await until(() => !env.state.files.get(PATH).includes('light'), 2000);
    } finally {
      env.uninstall();
    }
  });

  test('after a chip is removed the focus moves to the next chip’s x, or to the add field when none is left', async () => {
    const env = await load({ files: { [PATH]: LISTED } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      const xs = () => row(panel, 'HAS_TAG').querySelectorAll('.multi-select-pill-remove-button');
      removeChip(panel, 'HAS_TAG', 'light');
      assert.ok(env.doc.activeElement === xs()[0], 'the x of cheap, which took its place');
      removeChip(panel, 'HAS_TAG', 'cheap');
      assert.ok(env.doc.activeElement === field(panel, 'Add to HAS_TAG'), 'the add field, with no chip left');
    } finally {
      env.uninstall();
    }
  });

  test('a thing something else links to stays when its chip is removed, and the inspector says so', async () => {
    const shared = LISTED.replace(
      '(large)-[:HAS_TAG]->(light),',
      '(large)-[:HAS_TAG]->(light),\n(small:Option),\n(small)-[:HAS_TAG]->(light),',
    );
    const env = await load({ files: { [PATH]: shared } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      removeChip(panel, 'HAS_TAG', 'light');
      assert.doesNotMatch(text(el), /\(large\)-\[:HAS_TAG\]->\(light\)/);
      assert.match(text(el), /\(light:Tag\)/);
      assert.match(status(el).textContent, /light stays, as something else links to it/);
    } finally {
      env.uninstall();
    }
  });

  test('a value is added in place: a new chip, and a thing written for it', async () => {
    const env = await load({ files: { [PATH]: LISTED } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      addChip(panel, 'HAS_TAG', 'Open late');
      assert.equal(
        text(el),
        `${BLOCK_OF(LISTED)},\n(open_late:Tag {name: 'Open late'}),\n(large)-[:HAS_TAG]->(open_late)`,
      );
      assert.deepEqual(chips(panel, 'HAS_TAG'), ['light', 'cheap', 'Open late']);
      assert.equal(
        row(panel, 'HAS_TAG').querySelector('input.multi-select-input').value,
        '',
        'the field is ready for the next',
      );
    } finally {
      env.uninstall();
    }
  });

  test('a value that names a thing already there is linked to it, not written a second time', async () => {
    const withTag = LISTED.replace('(cheap:Tag),', "(cheap:Tag),\n(late:Tag {name: 'Open late'}),");
    const env = await load({ files: { [PATH]: withTag } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      addChip(panel, 'HAS_TAG', 'open late');
      assert.match(text(el), /\(large\)-\[:HAS_TAG\]->\(late\)$/);
      assert.equal((text(el).match(/:Tag/g) ?? []).length, 3, 'no second Open late');
      assert.deepEqual(chips(panel, 'HAS_TAG'), ['light', 'cheap', 'Open late']);
    } finally {
      env.uninstall();
    }
  });

  test('a value already in the list, or an empty one, is refused, saying why, and nothing is written', async () => {
    const env = await load({ files: { [PATH]: LISTED } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      addChip(panel, 'HAS_TAG', 'Light');
      assert.match(alert(el).textContent, /Light is already in the list/);
      addChip(panel, 'HAS_TAG', '   ');
      assert.match(alert(el).textContent, /a value cannot be empty/);
      assert.equal(text(el), BLOCK_OF(LISTED));
    } finally {
      env.uninstall();
    }
  });

  test('two values added in turn, before the card is drawn again, are two things and two links', async () => {
    const env = await load({ files: { [PATH]: LISTED } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      addChip(panel, 'HAS_TAG', 'Open late');
      addChip(panel, 'HAS_TAG', 'Open late');
      assert.match(alert(el).textContent, /already in the list/);
      addChip(panel, 'HAS_TAG', 'Fast');
      assert.deepEqual(chips(panel, 'HAS_TAG'), ['light', 'cheap', 'Open late', 'Fast']);
      assert.equal((text(el).match(/\(open_late:Tag/g) ?? []).length, 1);
    } finally {
      env.uninstall();
    }
  });

  test('an empty list made from a property with no value still shows its row, to add the first value', async () => {
    const empty = NOTE3.replace("tags: 'light, cheap'", "tags: ''");
    const env = await load({ files: { [PATH]: empty } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      makeList(env, panel, 'tags', 'Tag', 'HAS_TAG');
      assert.deepEqual(chips(panel, 'HAS_TAG'), []);
      addChip(panel, 'HAS_TAG', 'light');
      assert.deepEqual(chips(panel, 'HAS_TAG'), ['light']);
      await until(() => env.state.files.get(PATH).includes('(large)-[:HAS_TAG]->(light)'), 2000);
      const again = await show(env);
      assert.deepEqual(chips(again.querySelector('.graph-note-details'), 'HAS_TAG'), ['light']);
    } finally {
      env.uninstall();
    }
  });

  test('a new property row can be made a list before it has a value: the list is declared, nothing is written', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'New property name'), 'topics');
      pick(env, panel, '', 'List');
      assert.equal(field(panel, 'Kind of the linked things').value, 'Topic');
      labelled(panel, 'Make list').click();
      assert.equal(text(el), BLOCK_OF(NOTE3), 'a list with no values is no text');
      assert.deepEqual(chips(panel, 'HAS_TOPIC'), []);
      addChip(panel, 'HAS_TOPIC', 'rain');
      assert.match(text(el), /\(rain:Topic\),\n\(large\)-\[:HAS_TOPIC\]->\(rain\)/);
    } finally {
      env.uninstall();
    }
  });
});

describe('the name typed for a list stays visible', () => {
  const keyOf = (panel, rel) => row(panel, rel).querySelector('.graph-note-list-key').textContent;
  /** Adds a property named `name` to the open details and chooses List for it, leaving the form open. */
  const choosing = (env, panel, name) => {
    panel.querySelector('.metadata-add-button').click();
    enter(field(panel, 'New property name'), name);
    pick(env, panel, '', 'List');
  };

  test('the form says, in one sentence, that the values become linked things and the row is named after the relationship', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      choosing(env, panel, 'rivals');
      assert.equal(field(panel, 'Kind of the linked things').value, 'Rival');
      assert.equal(field(panel, 'Relationship from this thing').value, 'HAS_RIVAL');
      const said = panel.querySelector('.graph-note-list-form .graph-note-list-note');
      assert.equal(
        said.textContent,
        'Each value of rivals becomes a thing linked by the relationship, and the row is named after it.',
      );
    } finally {
      env.uninstall();
    }
  });

  test('for the rest of the session the row is labelled with the typed name and the relationship', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      choosing(env, panel, 'rivals');
      labelled(panel, 'Make list').click();
      assert.equal(keyOf(panel, 'HAS_RIVAL'), 'rivals · HAS_RIVAL');
      addChip(panel, 'HAS_RIVAL', 'Reading tablet');
      assert.match(
        text(el),
        /\(reading_tablet:Rival \{name: 'Reading tablet'\}\),\n\(large\)-\[:HAS_RIVAL\]->\(reading_tablet\)/,
      );
      // the details drawn again, on another thing and back, keep the label
      tapKey(el, 'q');
      tapKey(el, 'large');
      assert.equal(keyOf(el.querySelector('.graph-note-details'), 'HAS_RIVAL'), 'rivals · HAS_RIVAL');
    } finally {
      env.uninstall();
    }
  });

  test('the label lasts the session: Done, then Edit here again, still shows the typed name', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      choosing(env, panel, 'rivals');
      labelled(panel, 'Make list').click();
      addChip(panel, 'HAS_RIVAL', 'Reading tablet');
      labelled(el, 'Done').click();
      await until(() => !el.querySelector('textarea'), 2000);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'), 2000);
      // the details stay open through Done and Edit here, drawn again by a new editor
      assert.ok(row(panel, 'HAS_RIVAL'), 'the list made in this session is still offered');
      assert.equal(keyOf(panel, 'HAS_RIVAL'), 'rivals · HAS_RIVAL');
    } finally {
      env.uninstall();
    }
  });

  test('a property that had values is labelled with its name too', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      makeList(env, panel, 'tags', 'Tag', 'HAS_TAG');
      assert.equal(keyOf(panel, 'HAS_TAG'), 'tags · HAS_TAG');
    } finally {
      env.uninstall();
    }
  });

  test('after a reload only the relationship shows: the typed name is recorded nowhere', async () => {
    const env = await load({ files: { [PATH]: NOTE3 } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      choosing(env, panel, 'rivals');
      labelled(panel, 'Make list').click();
      addChip(panel, 'HAS_RIVAL', 'Reading tablet');
      labelled(el, 'Done').click();
      await until(() => el.querySelector('textarea') === null);
      await until(() => env.state.files.get(PATH).includes('(large)-[:HAS_RIVAL]->(reading_tablet)'), 2000);
      const written = env.state.files.get(PATH);
      assert.doesNotMatch(written, /rivals/, 'the note does not hold the typed name');
      // a reload: the plugin loaded afresh on the note as written
      env.uninstall();
      const reloaded = await load({ files: { [PATH]: written } });
      try {
        const again = await editing(reloaded);
        tapKey(again, 'large');
        assert.equal(keyOf(again.querySelector('.graph-note-details'), 'HAS_RIVAL'), 'HAS_RIVAL');
      } finally {
        reloaded.uninstall();
      }
    } finally {
      env.uninstall();
    }
  });
});
