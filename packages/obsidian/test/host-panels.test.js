// Obsidian's two panes are drawn through the plug-in interface (editor spec §43, plugin_interface and
// plugin_contract_suites): each is a panel of a built-in plug-in, and passes the panel contract of any plug-in's.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { panelContract } from '../../core/src/display/panel-contract.ts';
describe('the built-in panels', () => {
  test('the edit pane and the details pane are the two panels of the registry', async () => {
    const { panelRegistry, OBSIDIAN_PANELS_ID } = await import('../src/host-panels.ts');
    assert.deepEqual(
      panelRegistry()
        .panels()
        .map((p) => p.id),
      [`${OBSIDIAN_PANELS_ID}.edit`, `${OBSIDIAN_PANELS_ID}.details`],
    );
  });

  test('each passes every check of the panel contract, drawn into a right-to-left element', async () => {
    const { panelRegistry, OBSIDIAN_PANELS_ID } = await import('../src/host-panels.ts');
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    const place = () => doc.body.appendChild(doc.createElement('div'));
    for (const p of panelRegistry().panels())
      for (const check of panelContract(p, OBSIDIAN_PANELS_ID, place)) check.run();
  });

  test('a pane is drawn by what its view gave, through its panel, and a panel that is not there says so', async () => {
    const { showPane } = await import('../src/host-panels.ts');
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    const el = doc.createElement('div');
    assert.equal(
      showPane('details', el, (e) => e.setAttribute('data-drawn', 'yes')),
      null,
    );
    assert.equal(el.getAttribute('data-drawn'), 'yes');
    assert.match(showPane('nowhere', el, () => {}) ?? '', /nowhere/);
  });
});
