// The property type menu stays on screen (spec §14, inspector_native): opened from an icon near the bottom of the window it
// is shown above the icon, so its last item, Checkbox among them, is not cut off; opened with room below it is shown
// under the icon as before. Obsidian's own Menu places itself from the position it is given, so the position is what is tested.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { PATH, NOTE } from './host/card-notes.js';
import { editing, tapKey, row } from './host/inspector-steps.js';

before(() => build());

/** Opens the type menu of the `name` property from an icon at the given place, in a window of the given height. */
async function opened({ top, bottom, height = 800, mobile = false }) {
  const env = await load({ files: { [PATH]: NOTE }, mobile });
  try {
    const el = await editing(env);
    tapKey(el, 'large');
    const icon = row(el.querySelector('.graph-note-details'), 'name').querySelector('.metadata-property-icon');
    icon.getBoundingClientRect = () => ({ left: 24, right: 44, top, bottom, width: 20, height: bottom - top });
    env.doc.defaultView.innerHeight = height;
    icon.click();
    const menu = env.state.menus.at(-1);
    return { at: menu.shownAt, titles: menu.items.map((i) => i.title) };
  } finally {
    env.uninstall();
  }
}

describe('where the property type menu is shown', () => {
  test('with room below the icon it opens under it, at its left edge', async () => {
    const { at, titles } = await opened({ top: 100, bottom: 120 });
    assert.deepEqual(at, { x: 24, y: 120 });
    assert.ok(titles.includes('Checkbox'));
  });

  test('from an icon near the bottom of the window it opens above the icon, so Checkbox is not cut off', async () => {
    const { at } = await opened({ top: 740, bottom: 760 });
    assert.equal(at.x, 24);
    assert.ok(at.y >= 0 && at.y < 740, `above the icon, not under it: ${at.y}`);
  });

  test('on a phone, where a menu row is taller, the same icon needs more room before the menu opens under it', async () => {
    const place = { top: 500, bottom: 520 };
    assert.equal((await opened(place)).at.y, 520, 'a desktop menu fits below');
    const phone = await opened({ ...place, mobile: true });
    assert.ok(phone.at.y < 500, `a phone menu opens above: ${phone.at.y}`);
  });

  test('with no room above or below it opens as low as the window allows, never off the top', async () => {
    const { at } = await opened({ top: 100, bottom: 120, height: 300 });
    assert.ok(at.y >= 0 && at.y < 120, `${at.y}`);
  });
});
