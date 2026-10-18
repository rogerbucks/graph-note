// Walked paths in a drawing (editor spec §7, record_and_play, path_no_steps, steps_numbered). Play steps through a path
// written in the note, one thing at a time, said to screen readers. A path with no steps is never played as an empty
// story. While the card is edited, Record writes a path from the boxes tapped in order, each numbered as it is tapped.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, show } from './host/card-notes.js';
import { tapKey, text } from './host/inspector-steps.js';

before(() => build());

const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(home)-[:NEAR]->(park)`;
const WALKED = `${TRIP},
(tour:Path {title: 'Sunday walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 3}]->(cafe)`;
const EMPTY = `${TRIP},
(idle:Path {title: 'Nowhere yet'})`;
const noteOf = (block) => ['# Trip', '', fence(block), ''].join('\n');
const nodeOf = (el, key) => el.querySelectorAll('g.node').find((n) => n.getAttribute('data-key') === key);
const strip = (el) => el.querySelector('.thoughtknot-walk');

describe('Play', () => {
  test('steps through a path in order, one thing at a time, marked and said', async () => {
    const env = await load({ files: { [PATH]: noteOf(WALKED) } });
    try {
      const el = await show(env);
      labelled(el, 'Play Sunday walk').click();
      assert.match(strip(el).querySelector('[aria-live]').textContent, /^Step 1 of 3: Home$/);
      assert.ok(nodeOf(el, 'home').classList.contains('thoughtknot-step-current'));
      labelled(el, 'Next step').click();
      assert.match(strip(el).querySelector('[aria-live]').textContent, /^Step 2 of 3: The park$/);
      assert.ok(nodeOf(el, 'park').classList.contains('thoughtknot-step-current'));
      assert.ok(!nodeOf(el, 'home').classList.contains('thoughtknot-step-current'), 'one step at a time');
      labelled(el, 'Previous step').click();
      assert.match(strip(el).querySelector('[aria-live]').textContent, /^Step 1 of 3/);
      labelled(el, 'Stop playing').click();
      assert.ok(!el.querySelectorAll('g.node').some((n) => n.classList.contains('thoughtknot-step-current')));
    } finally {
      env.uninstall();
    }
  });

  test('the focus stays on Next as it is pressed, and one live region says each step', async () => {
    const env = await load({ files: { [PATH]: noteOf(WALKED) } });
    try {
      const el = await show(env);
      labelled(el, 'Play Sunday walk').click();
      const live = strip(el).querySelector('[aria-live]');
      const next = labelled(el, 'Next step');
      next.focus();
      next.click();
      assert.ok(labelled(el, 'Next step') === next, 'the same button, never built again');
      assert.ok(env.doc.activeElement === next, 'the focus is where it was');
      assert.ok(strip(el).querySelector('[aria-live]') === live, 'one live region, its words changed');
      assert.match(live.textContent, /^Step 2 of 3/);
    } finally {
      env.uninstall();
    }
  });

  test('at its last step, Next goes no further; at its first, Previous goes no further', async () => {
    const env = await load({ files: { [PATH]: noteOf(WALKED) } });
    try {
      const el = await show(env);
      labelled(el, 'Play Sunday walk').click();
      assert.ok(labelled(el, 'Previous step').disabled);
      labelled(el, 'Next step').click();
      labelled(el, 'Next step').click();
      assert.match(strip(el).querySelector('[aria-live]').textContent, /^Step 3 of 3: Cafe$/);
      assert.ok(labelled(el, 'Next step').disabled);
    } finally {
      env.uninstall();
    }
  });

  test('a path with no steps is never played as an empty story: it is said to have none', async () => {
    const env = await load({ files: { [PATH]: noteOf(EMPTY) } });
    try {
      const el = await show(env);
      assert.equal(labelled(el, 'Play Nowhere yet'), undefined);
      assert.match(strip(el).textContent, /the path Nowhere yet has no steps/);
    } finally {
      env.uninstall();
    }
  });
});

describe('Record, while the card is edited', () => {
  test('writes a path from the boxes tapped in order, each numbered as it is tapped', async () => {
    const env = await load({ files: { [PATH]: noteOf(TRIP) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      await until(() => !!labelled(el, 'Record a path'));
      labelled(el, 'Record a path').click();
      tapKey(el, 'cafe');
      tapKey(el, 'home');
      const number = (key) =>
        nodeOf(el, key)
          .querySelectorAll('text')
          .find((t) => t.getAttribute('class') === 'thoughtknot-step-number')?.textContent;
      assert.equal(number('cafe'), '1');
      assert.equal(number('home'), '2');
      assert.match(strip(el).querySelector('[aria-live]').textContent, /2 steps/);
      assert.ok(
        el.querySelector('.thoughtknot-details').hidden,
        'a tap while recording adds a step, and opens nothing',
      );
      const title = el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === 'Path title');
      title.value = 'Coffee first';
      labelled(el, 'Save path').click();
      await until(() => /:Path/.test(text(el)));
      assert.match(text(el), /:Path \{title: 'Coffee first'\}\)/);
      assert.match(text(el), /-\[:STEP \{seq: 1\}\]->\(cafe\)/);
      assert.match(text(el), /-\[:STEP \{seq: 2\}\]->\(home\)/);
    } finally {
      env.uninstall();
    }
  });

  test('a title typed before the taps is kept: tapping never clears it', async () => {
    const env = await load({ files: { [PATH]: noteOf(TRIP) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!labelled(el, 'Record a path'));
      labelled(el, 'Record a path').click();
      const title = () => el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === 'Path title');
      const typedIn = title();
      typedIn.value = 'Coffee first';
      tapKey(el, 'cafe');
      tapKey(el, 'home');
      assert.ok(title() === typedIn, 'the same field, never built again under a tap');
      labelled(el, 'Save path').click();
      await until(() => /:Path/.test(text(el)));
      assert.match(text(el), /title: 'Coffee first'/);
    } finally {
      env.uninstall();
    }
  });

  test('a path with no title is not written, and the strip says to give it one', async () => {
    const env = await load({ files: { [PATH]: noteOf(TRIP) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!labelled(el, 'Record a path'));
      labelled(el, 'Record a path').click();
      tapKey(el, 'cafe');
      labelled(el, 'Save path').click();
      await wait(50);
      assert.doesNotMatch(text(el), /:Path/);
      assert.match(strip(el).querySelector('[role="alert"]').textContent, /title/);
    } finally {
      env.uninstall();
    }
  });

  test('a recording ends when editing ends, and says so', async () => {
    const env = await load({ files: { [PATH]: noteOf(TRIP) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!labelled(el, 'Record a path'));
      labelled(el, 'Record a path').click();
      tapKey(el, 'cafe');
      labelled(el, 'Done editing').click();
      await until(() => !el.querySelector('textarea'));
      assert.equal(labelled(el, 'Save path'), undefined);
      assert.match(strip(el).querySelector('[aria-live]').textContent, /recording ended/i);
    } finally {
      env.uninstall();
    }
  });

  test('Undo step takes the last tap back; Cancel writes nothing', async () => {
    const env = await load({ files: { [PATH]: noteOf(TRIP) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!labelled(el, 'Record a path'));
      labelled(el, 'Record a path').click();
      tapKey(el, 'cafe');
      tapKey(el, 'home');
      labelled(el, 'Undo step').click();
      assert.equal(
        nodeOf(el, 'home')
          .querySelectorAll('text')
          .some((t) => t.getAttribute('class') === 'thoughtknot-step-number'),
        false,
      );
      labelled(el, 'Cancel recording').click();
      await wait(50);
      assert.doesNotMatch(text(el), /:Path/);
    } finally {
      env.uninstall();
    }
  });

  test('saving with no steps writes nothing, and says why', async () => {
    const env = await load({ files: { [PATH]: noteOf(TRIP) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!labelled(el, 'Record a path'));
      labelled(el, 'Record a path').click();
      el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === 'Path title').value = 'Nowhere';
      labelled(el, 'Save path').click();
      await wait(50);
      assert.doesNotMatch(text(el), /:Path/);
      assert.match(strip(el).querySelector('[role="alert"]').textContent, /step/);
    } finally {
      env.uninstall();
    }
  });

  test('is offered only while the card is edited', async () => {
    const env = await load({ files: { [PATH]: noteOf(TRIP) } });
    try {
      const el = await show(env);
      assert.equal(labelled(el, 'Record a path'), undefined);
    } finally {
      env.uninstall();
    }
  });
});
