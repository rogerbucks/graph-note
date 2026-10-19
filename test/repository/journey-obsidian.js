// The first-run journey in the Obsidian host (editor spec §41, ux_journey_auto). The built plugin runs against the
// test host's stand-ins for Obsidian and its vault. A person opens the note, reads its graph, edits it, fixes its problem
// and exports it. Each action goes through the Journey that counts it (scripts/ux-journey.mjs). Each stage checks what it
// left: the details read, the note written, the problem gone, the image saved. Test code only.
import assert from 'node:assert/strict';
import { word } from '@thoughtknot/core';
import { load, until } from '../../packages/obsidian/test/host/load-plugin.js';
import { PATH, show } from '../../packages/obsidian/test/host/card-notes.js';
import { Journey, named } from '../../scripts/ux-journey.mjs';
import { EDITED, GRAPH, NOTE, SAYS } from './journey-note.js';

/** A control the person can see, found by its name: one missing fails, naming it. */
function control(root, name) {
  const el = named(root, name);
  assert.ok(el, `the person finds no control called "${name}"`);
  return el;
}

const tap = (el) => el.dispatch('keydown', { key: 'Enter' });

/** Runs the journey in a fresh vault holding the note; gives the Journey, with its counts. */
export async function obsidianJourney() {
  const env = await load({ files: { [PATH]: NOTE } });
  const file = () => env.state.files.get(PATH);
  const person = new Journey('obsidian');
  try {
    person.stage('open the note');
    // the note is chosen in Obsidian's file list, and Obsidian draws its block
    let card = await person.use(PATH.replace(/\.md$/, ''), () => show(env));
    await until(() => card.querySelectorAll('g.node').length === 3);

    person.stage('read the graph');
    await person.use(SAYS.question, () => tap(control(card, SAYS.question)));
    await until(() => /answered by ‘Large reader’/.test(card.querySelector('.thoughtknot-details')?.textContent ?? ''));

    person.stage('edit it');
    await person.use(word('bar.edit-here'), () => control(card, word('bar.edit-here')).click());
    await until(() => !!card.querySelector('textarea'));
    const field = control(card, SAYS.field);
    await person.use(SAYS.field, () => {
      field.value = EDITED;
      field.dispatch('input');
    });
    await person.use(word('bar.done-editing'), () => control(card, word('bar.done-editing')).click());
    await until(() => !card.querySelector('textarea') && file().includes("(small:Option {name: 'Small reader'})"));
    // Obsidian draws the block again, as its text changed
    card = await show(env);

    person.stage('fix a problem');
    assert.equal(control(card, word('bar.problems', { count: 1 })) !== undefined, true, 'one problem, said on the bar');
    await person.use(SAYS.slip, () => tap(control(card, SAYS.slip)));
    await until(() => !!named(card, SAYS.fix));
    await person.use(SAYS.fix, () => control(card, SAYS.fix).click());
    await until(() => file().includes('(eyes)-[:FAVOURS]->(large)'));
    card = await show(env);
    assert.ok(named(card, word('bar.no-problems')), 'no problems left');

    person.stage('export it');
    env.state.notices.length = 0;
    await person.use(word('bar.export'), () => control(card, word('bar.export')).click());
    const form = card.querySelector('.thoughtknot-export');
    assert.ok(form, 'the Export form opens');
    await person.use(word('export.it'), () => control(form, word('export.it')).click());
    await until(() => [...env.state.files.keys()].some((p) => p.endsWith('.svg')));
    assert.match(env.state.notices.at(-1) ?? '', /Exported/);
    assert.equal(file(), NOTE.replace(GRAPH, EDITED).replace('->(larg)', '->(large)'), 'the note, edited and fixed');
    return person;
  } finally {
    env.uninstall();
  }
}
