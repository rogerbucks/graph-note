// The first-run journey in VS Code (editor spec §41, ux_journey_auto; vscode_plugin). The extension runs as built,
// against the stand-in for VS Code over a real workspace folder holding the note. Its tab's page runs in a DOM
// (packages/vscode/test/vscode-window.js). A person chooses Open in ThoughtKnot on the note, reads its graph, edits it,
// fixes its problem and exports it. Each action goes through the Journey that counts it (scripts/ux-journey.mjs). Each
// stage checks what it left. Test code only.
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { word } from '@thoughtknot/core';
import { until } from '../../packages/obsidian/test/host/load-plugin.js';
import { emptyFolder, openVscodeTab } from '../../packages/vscode/test/vscode-window.js';
import { Journey, named } from '../../scripts/ux-journey.mjs';
import { EDITED, GRAPH, NOTE, SAYS } from './journey-note.js';

/** A control the person can see, found by its name: one missing fails, naming it. */
function control(root, name) {
  const el = named(root, name);
  assert.ok(el, `the person finds no control called "${name}"`);
  return el;
}

/** Runs the journey on a fresh workspace folder holding the note; gives the Journey, with its counts. */
export async function vscodeJourney() {
  const person = new Journey('vscode');
  const folder = emptyFolder();
  writeFileSync(join(folder, 'Reader.md'), NOTE);

  person.stage('open the note');
  // the note is open in VS Code's text editor; the person chooses Open in ThoughtKnot from its title bar
  let page;
  await person.use('Open in ThoughtKnot', async () => (page = await openVscodeTab(folder, 'Reader.md')));
  assert.equal(page.vs.tabs.length, 1, 'one tab opens beside the note');
  try {
    await page.ready();
    const doc = page.doc;
    const tap = (el) => el.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(() => doc.querySelectorAll('.thoughtknot-svg g.node').length === 3, 8000);

    person.stage('read the graph');
    await person.use(SAYS.question, () => tap(control(doc, SAYS.question)));
    await until(() => /answered by ‘Large reader’/.test(doc.querySelector('.thoughtknot-details')?.textContent ?? ''));

    person.stage('edit it');
    const field = control(doc, SAYS.field);
    assert.equal(field, page.field(), 'the text field is named for its graph');
    await person.use(SAYS.field, () => page.typed(EDITED));
    assert.ok(page.file().includes("(small:Option {name: 'Small reader'})"), 'the edit is written to the note');

    person.stage('fix a problem');
    await until(() => !!named(doc, SAYS.fix), 8000);
    await person.use(SAYS.fix, () => control(doc, SAYS.fix).click());
    await until(() => page.file().includes('(eyes)-[:FAVOURS]->(large)'), 8000);
    await until(() => !!named(doc, word('bar.no-problems')), 8000);

    person.stage('export it');
    const exporter = () => named(doc.querySelector('.gn-export-bar') ?? doc, word('bar.export'));
    await until(() => !!exporter(), 8000);
    await person.use(word('bar.export'), () => exporter().click());
    await until(() => !!doc.querySelector('.thoughtknot-export'));
    await person.use(word('export.it'), () =>
      control(doc.querySelector('.thoughtknot-export'), word('export.it')).click(),
    );
    const saved = () => readdirSync(folder).filter((f) => f.endsWith('.svg'));
    await until(() => saved().length === 1, 8000);
    assert.match(saved()[0], /^Reader-reader-\d{4}-\d\d-\d\d\.svg$/);
    assert.equal(
      page.file(),
      NOTE.replace(GRAPH, EDITED).replace('->(larg)', '->(large)'),
      'the note, edited and fixed',
    );
    return person;
  } finally {
    await page.stop();
  }
}
