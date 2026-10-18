// What the quick-info tooltip says of how a thing is linked, and who hears it (editor spec §24, quick_info_links,
// quick_info_read_aloud): a thing's tooltip leads with the sentence its details open with, so the two never disagree;
// and a thing or link that has the keyboard focus is described by its tooltip, so a screen reader reads
// it, and no longer once the tooltip closes.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { show, PATH } from './host/card-notes.js';
import { fence } from './host/notes.js';
import { GRAPH } from './host/view-notes.js';
import { clock, link, open, pointerOver, thing, tipOf } from './host/quick-info-steps.js';

before(() => build());

const FILES = { [PATH]: ['# Reader', '', fence(GRAPH), ''].join('\n') };

/** The card, drawn once the layout is done, and the held clock. */
async function drawn(env) {
  const el = await show(env);
  await until(() => !!el.querySelector('g.node'));
  return { el, time: clock(env) };
}
const links = (env) => tipOf(env).querySelector('.thoughtknot-quick-links')?.textContent;

describe('quick_info_links: the tooltip says how a thing is linked', () => {
  test('a thing’s tooltip leads with how it is linked, under its name, as its details say it', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      pointerOver(thing(el, 'q'));
      time.fire();
      await until(() => open(env));
      assert.equal(links(env), 'This question is answered by ‘Large reader’ and ‘Tablet’.');
      const parts = tipOf(env).children.map((c) => c.className);
      assert.ok(
        parts.indexOf('thoughtknot-quick-links') === parts.indexOf('thoughtknot-quick-head') + 1,
        'under its name',
      );
    } finally {
      env.uninstall();
    }
  });
});

describe('quick_info_read_aloud: a screen reader reads the tooltip of what has the focus', () => {
  test('a thing with the keyboard focus is described by its tooltip, and no longer once the focus leaves', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el } = await drawn(env);
      const q = thing(el, 'q');
      q.focus();
      await until(() => open(env));
      const id = tipOf(env).getAttribute('id');
      assert.ok(id, 'the tooltip has an id');
      assert.equal(q.getAttribute('aria-describedby'), id);
      q.blur();
      assert.equal(q.getAttribute('aria-describedby'), null);
    } finally {
      env.uninstall();
    }
  });

  test('a link with the keyboard focus is described by its tooltip too', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el } = await drawn(env);
      const l = link(el, 0);
      l.focus();
      await until(() => open(env));
      assert.ok(tipOf(env).getAttribute('id'), 'the tooltip has an id');
      assert.equal(l.getAttribute('aria-describedby'), tipOf(env).getAttribute('id'));
    } finally {
      env.uninstall();
    }
  });
});
