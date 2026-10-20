// Every plug-in works in a right-to-left language (editor spec §43, plugin_rtl). The words it adds, the titles of its
// exports, storage, commands and panels, force no direction of their own. So each reads in the host's direction, and a
// host shows each isolated, so a name keeps its own direction beside it. A panel drawn right to left keeps that
// direction, forces none but auto, and styles with logical sides only. Each point's contract suite checks it, and the
// built-ins pass.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { commandContract, exporterContract, storageBackendContract } from '../src/plugins-contract.ts';
import { pluginRegistry } from '../src/plugins.ts';
import { CORE_EXPORTS } from '../src/export-data.ts';
import { CORE_STORAGE, memoryStorage } from '../src/note-storage.ts';
import { JSDOM } from 'jsdom';
import { panelContract } from '../src/display/panel-contract.ts';

const DOC = new JSDOM('<!doctype html><body></body>').window.document;
/** A new, empty element in the page, as a host makes one for a panel. */
const PLACE = () => DOC.body.appendChild(DOC.createElement('div'));

const CHECK = 'its title reads in the host’s direction, forcing none of its own';

/** The direction check among `checks`, run: undefined when it passes, else what it said. */
const direction = async (checks) => {
  const check = checks.find((c) => c.name === CHECK);
  assert.ok(check, 'the point’s contract checks the direction of its title');
  try {
    await check.run();
    return undefined;
  } catch (err) {
    return err.message;
  }
};

/** Each point's checks of a thing with the title `title`. */
const POINTS = {
  export: (title) => exporterContract({ format: 'x', title, extension: 'txt', mime: 'text/plain', write: () => '' }),
  storage: (title) => storageBackendContract({ name: 'x', title, open: () => memoryStorage() }),
  command: (title) => commandContract({ id: 'acme.x.go', title, run: () => {} }, 'acme.x'),
  panel: (title) => panelContract({ id: 'acme.x.list', title, render: () => {} }, 'acme.x', PLACE),
};

/** The names of the checks the panel drawn by `render` fails. */
const panelFails = (render) =>
  panelContract({ id: 'acme.x.list', title: 'قائمة', render }, 'acme.x', PLACE).flatMap((c) => {
    try {
      c.run();
      return [];
    } catch {
      return [c.name];
    }
  });

/** A panel's render that draws `html` into its element. */
const drawing = (html) => (el) => (el.innerHTML = html);

/** A mark of each kind that forces a direction. */
const FORCING = {
  'a right-to-left mark': 'تصدير‏',
  'a left-to-right embedding': '‪Export‬',
  'a right-to-left override': '‮Export‬',
  'a left-to-right isolate': '⁦Export⁩',
  'an Arabic letter mark': 'تصدير؜',
};

describe('a plug-in in a right-to-left language', () => {
  for (const [point, checks] of Object.entries(POINTS)) {
    test(`a ${point} titled in Arabic, Hebrew or English reads in the host’s direction`, async () => {
      for (const title of ['تصدير الرسم', 'ייצוא הגרף', 'Export the graph', 'CSV · تصدير'])
        assert.equal(await direction(checks(title)), undefined, title);
    });

    for (const [mark, title] of Object.entries(FORCING))
      test(`a ${point} whose title has ${mark} fails, as it forces its own direction`, async () => {
        assert.match(await direction(checks(title)), /wanted a title with no direction marks/);
      });
  }

  test('every built-in’s titles read in the host’s direction', async () => {
    const registry = pluginRegistry();
    registry.register(CORE_EXPORTS);
    registry.register(CORE_STORAGE);
    for (const e of registry.exporters()) assert.equal(await direction(exporterContract(e)), undefined, e.title);
    for (const b of registry.storages()) assert.equal(await direction(storageBackendContract(b)), undefined, b.title);
  });

  test('a panel drawn right to left, with a name kept in its own direction and logical sides, passes', () => {
    const html =
      '<h3>الوسوم</h3><ul><li><bdi dir="auto">Ada Lovelace</bdi></li></ul>' +
      '<p style="margin-inline-start: 4px; padding-inline-end: 2px; text-align: start">٣ وسوم</p>';
    assert.deepEqual(panelFails(drawing(html)), []);
  });

  for (const [what, render, check] of [
    ['forces left to right on what it draws', drawing('<p dir="ltr">Tags</p>'), 'it forces no direction'],
    ['forces right to left on what it draws', drawing('<p dir="RTL">Tags</p>'), 'it forces no direction'],
    ['changes the direction of the element it is given', (el) => (el.dir = 'ltr'), 'it draws into the element'],
    ['styles with a left margin', drawing('<p style="margin-left: 4px">x</p>'), 'its styles use logical sides'],
    [
      'places a box by its right side',
      drawing('<p style="position: absolute; right: 0">x</p>'),
      'its styles use logical',
    ],
    ['floats to the left', drawing('<p style="float: left">x</p>'), 'its styles use logical sides'],
    ['aligns its text to the right', drawing('<p style="text-align:right">x</p>'), 'its styles use logical sides'],
  ])
    test(`a panel that ${what} fails the check that holds it`, () => {
      const failed = panelFails(render);
      assert.equal(failed.length, 1, failed.join('\n'));
      assert.ok(failed[0].startsWith(check), failed[0]);
    });
});
