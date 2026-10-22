// How a thing's details read (editor spec §25, details_said, details_ins_outs, details_properties_table):
// - A sentence at the top says what is going on.
// - Then its links come in two labelled parts, in before out, each with its count.
//   Each link is a single line of its own: its reading, then the thing at its other end. A group of more than one
//   says how many on its first line.
// - Then its properties come as a table of name and value.
// The built plugin, against the stand-ins.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';
import { tapKey } from './host/inspector-steps.js';
import { rules, winner } from './host/cascade.js';
import { styles } from './host/view-notes.js';

before(() => build());

const details = (el) => el.querySelector('.thoughtknot-details');
const parts = (el) => details(el).querySelectorAll('.thoughtknot-links-part');
const said = (el) => details(el).querySelector('.thoughtknot-details-said')?.textContent;

describe('a thing’s details', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('open with a sentence saying what it is and how it is linked, before anything else in the body', () => {
    tapKey(el, 'q');
    assert.equal(
      said(el),
      'This question is answered by ‘Large reader’ and ‘Tablet’. It has 1 property and no problems.',
    );
    const body = details(el).querySelector('.thoughtknot-details-body');
    const first = body.children.find((c) => !c.classList.contains('thoughtknot-trail'));
    assert.ok(first.classList.contains('thoughtknot-details-said'), 'the sentence comes first');
  });

  test('show links in before links out, each part labelled and counted, saying so when it has none', () => {
    tapKey(el, 'q');
    const [ins, outs] = parts(el);
    assert.equal(ins.querySelector('h4').textContent, 'Links in2');
    assert.equal(ins.getAttribute('aria-labelledby'), ins.querySelector('h4').id);
    assert.equal(outs.querySelector('h4').textContent, 'Links out0');
    assert.equal(outs.querySelector('.thoughtknot-none').textContent, 'Links to nothing.');
  });

  test('head each group with its reading, and list its things one to a row, each a button', () => {
    tapKey(el, 'eyes');
    const [, outs] = parts(el);
    const groups = outs.querySelectorAll('.thoughtknot-link-group');
    assert.deepEqual(
      groups.map((g) => g.querySelector('.thoughtknot-link-reading').textContent),
      ['favours', 'counts against'],
    );
    const rows = groups[0].querySelectorAll('.thoughtknot-link-row');
    assert.deepEqual(
      rows.map((r) => r.querySelector('button.thoughtknot-link-thing').textContent),
      ['Large reader'],
    );
  });

  test('put each link on a single line of its own: its reading, then the thing, the group counted on its first', () => {
    tapKey(el, 'q');
    const [ins] = parts(el);
    const rows = ins.querySelectorAll('.thoughtknot-link-row');
    assert.equal(rows.length, 2, 'one line for each of its two links in');
    // its reading, less the group's count where the line shows one, and its thing
    const lineRead = (r) => {
      const reading = r.querySelector('.thoughtknot-link-reading');
      const count = reading?.querySelector('.thoughtknot-count')?.textContent ?? '';
      return [
        reading ? reading.textContent.slice(0, reading.textContent.length - count.length) : null,
        r.querySelector('button.thoughtknot-link-thing')?.textContent,
      ];
    };
    const [first, second] = rows.map(lineRead);
    assert.ok(first[0], 'the first line says its reading');
    assert.equal(second[0], first[0], 'and so does the second, on its own line');
    assert.deepEqual([first[1], second[1]], ['Large reader', 'Tablet']);
    assert.equal(rows[0].querySelector('.thoughtknot-count')?.textContent, '2', 'the group counted on its first line');
    assert.equal(rows[1].querySelector('.thoughtknot-count'), null);
  });

  test('keep each line to one line on the screen, the thing’s name cut short rather than wrapped', () => {
    const all = rules(styles, 'styles.css');
    const thing = {
      tag: 'button',
      classes: ['thoughtknot-link-thing'],
      ancestors: [{ tag: 'li', classes: ['thoughtknot-link-row'] }],
    };
    assert.equal(winner(all, thing, 'white-space')?.value, 'nowrap');
    assert.equal(winner(all, thing, 'text-overflow')?.value, 'ellipsis');
  });

  test('show its properties as a table of name and value', () => {
    tapKey(el, 'large');
    const dl = details(el).querySelector('dl.thoughtknot-rich-properties');
    assert.ok(dl, 'a description list');
    assert.deepEqual(
      dl.querySelectorAll('dt').map((d) => d.textContent),
      ['name'],
    );
    assert.deepEqual(
      dl.querySelectorAll('dd').map((d) => d.textContent),
      ['Large reader'],
    );
  });
});
