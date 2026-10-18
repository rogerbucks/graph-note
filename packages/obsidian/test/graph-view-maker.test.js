// Making a view by tapping (editor spec §7, views_by_tapping, five_view_kinds). While the card is edited, Make a view
// offers the kinds of view. The boxes tapped choose what it shows. Its reading is said in plain language as it is built.
// Write the view writes its query as a view block of its own after the graph's last block, never into the data.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, show } from './host/card-notes.js';
import { tapKey } from './host/inspector-steps.js';

before(() => build());

const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(ann:Person {name: 'Ann'}),
(home)-[:NEAR]->(park), (park)-[:NEAR]->(cafe), (ann)-[:LIVES_AT]->(home)`;
const NOTE = ['# Trip', '', fence(TRIP), '', 'After.', ''].join('\n');
const strip = (el) => el.querySelector('.thoughtknot-view-maker');
const said = (el) => strip(el).querySelector('[aria-live]').textContent;
const choose = (el, label, value) => {
  const sel = strip(el)
    .querySelectorAll('select')
    .find((s) => s.getAttribute('aria-label') === label);
  sel.value = value;
  sel.dispatch('change');
};
const nameIt = (el, name) => {
  strip(el)
    .querySelectorAll('input')
    .find((i) => i.getAttribute('aria-label') === 'View name').value = name;
};

async function making() {
  const env = await load({ files: { [PATH]: NOTE } });
  const el = await show(env);
  labelled(el, 'Edit here').click();
  await until(() => !!labelled(el, 'Make a view'));
  labelled(el, 'Make a view').click();
  return { env, el };
}

describe('making a view by tapping', () => {
  test('things tapped are picked by hand, said in plain English as they are, and written as a view block', async () => {
    const { env, el } = await making();
    try {
      tapKey(el, 'home');
      tapKey(el, 'cafe');
      assert.match(said(el), /Home and Cafe, picked by hand/);
      nameIt(el, 'ends');
      labelled(el, 'Write the view').click();
      await until(() => /QUERY view ends/.test(env.state.files.get(PATH)));
      const note = env.state.files.get(PATH);
      assert.ok(note.includes(fence(TRIP)), 'the data block is untouched');
      assert.match(
        note,
        /```gql\n\/\/ graph: trip · QUERY view ends\nMATCH \(n\) WHERE n\.id IN \['home', 'cafe'\] RETURN n\n```/,
      );
      assert.ok(note.indexOf('QUERY view ends') < note.indexOf('After.'), 'after the graph’s last block');
    } finally {
      env.uninstall();
    }
  });

  test('near a thing: the thing tapped, and how many steps', async () => {
    const { env, el } = await making();
    try {
      choose(el, 'Kind of view', 'near');
      tapKey(el, 'park');
      choose(el, 'Steps', '2');
      assert.match(said(el), /everything within 2 steps of The park/);
    } finally {
      env.uninstall();
    }
  });

  test('how one reaches another: the first thing tapped, then the second', async () => {
    const { env, el } = await making();
    try {
      choose(el, 'Kind of view', 'reaches');
      tapKey(el, 'home');
      tapKey(el, 'cafe');
      assert.match(said(el), /how Home reaches Cafe/);
    } finally {
      env.uninstall();
    }
  });

  test('only some kinds: the kinds of the things tapped', async () => {
    const { env, el } = await making();
    try {
      choose(el, 'Kind of view', 'kinds');
      tapKey(el, 'ann');
      assert.match(said(el), /only Person/);
    } finally {
      env.uninstall();
    }
  });

  test('a view with nothing chosen, or no name, is not written, and the strip says why', async () => {
    const { env, el } = await making();
    try {
      labelled(el, 'Write the view').click();
      assert.match(strip(el).querySelector('[role="alert"]').textContent, /tap|name/i);
      assert.doesNotMatch(env.state.files.get(PATH), /QUERY view/);
    } finally {
      env.uninstall();
    }
  });

  test('a name another view of the graph has is refused before anything is written, and said', async () => {
    const taken = NOTE.replace(
      'After.',
      `${fence("// graph: trip · QUERY view ends\nMATCH (n) WHERE n.id IN ['home'] RETURN n")}\n\nAfter.`,
    );
    const env = await load({ files: { [PATH]: taken } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!labelled(el, 'Make a view'));
      labelled(el, 'Make a view').click();
      tapKey(el, 'cafe');
      nameIt(el, 'ends');
      labelled(el, 'Write the view').click();
      await until(() => /already/.test(strip(el).querySelector('[role="alert"]').textContent));
      assert.equal((env.state.files.get(PATH).match(/QUERY view ends/g) ?? []).length, 1);
    } finally {
      env.uninstall();
    }
  });

  test('a tap while making a view chooses, and opens no details', async () => {
    const { env, el } = await making();
    try {
      tapKey(el, 'home');
      assert.ok(el.querySelector('.thoughtknot-details').hidden);
    } finally {
      env.uninstall();
    }
  });
});
