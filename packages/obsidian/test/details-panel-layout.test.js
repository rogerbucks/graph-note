// How a thing's details read (editor spec §25, details_said, details_ins_outs, details_properties_table): a sentence at
// the top saying what is going on; then its links in two labelled parts, in before out, each with its count, a group
// headed by its reading and its things one to a row; then its properties as a table of name and value. The built
// plugin, against the stand-ins.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';
import { tapKey } from './host/inspector-steps.js';

before(() => build());

const details = (el) => el.querySelector('.graph-note-details');
const parts = (el) => details(el).querySelectorAll('.graph-note-links-part');
const said = (el) => details(el).querySelector('.graph-note-details-said')?.textContent;

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
    const body = details(el).querySelector('.graph-note-details-body');
    const first = body.children.find((c) => !c.classList.contains('graph-note-trail'));
    assert.ok(first.classList.contains('graph-note-details-said'), 'the sentence comes first');
  });

  test('show links in before links out, each part labelled and counted, saying so when it has none', () => {
    tapKey(el, 'q');
    const [ins, outs] = parts(el);
    assert.equal(ins.querySelector('h4').textContent, 'Links in2');
    assert.equal(ins.getAttribute('aria-labelledby'), ins.querySelector('h4').id);
    assert.equal(outs.querySelector('h4').textContent, 'Links out0');
    assert.equal(outs.querySelector('.graph-note-none').textContent, 'Links to nothing.');
  });

  test('head each group with its reading, and list its things one to a row, each a button', () => {
    tapKey(el, 'eyes');
    const [, outs] = parts(el);
    const groups = outs.querySelectorAll('.graph-note-link-group');
    assert.deepEqual(
      groups.map((g) => g.querySelector('.graph-note-link-reading').textContent),
      ['favours', 'counts against'],
    );
    const rows = groups[0].querySelectorAll('.graph-note-link-row');
    assert.deepEqual(
      rows.map((r) => r.querySelector('button.graph-note-link-thing').textContent),
      ['Large reader'],
    );
  });

  test('show its properties as a table of name and value', () => {
    tapKey(el, 'large');
    const dl = details(el).querySelector('dl.graph-note-rich-properties');
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
