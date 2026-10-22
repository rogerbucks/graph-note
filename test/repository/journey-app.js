// The first-run journey in the desktop app (editor spec §41, ux_journey_auto; standalone_app). The app's window runs as
// built, in a DOM, over a real folder holding the note (packages/app/test/app-window.js). A person starts the app on the
// folder, opens the note from the list, reads its graph, edits it, fixes its problem and exports it. Each action goes
// through the Journey that counts it (scripts/ux-journey.mjs). Each stage checks what it left. Test code only.
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { word } from '@thoughtknot/core';
import { until } from '../../packages/obsidian/test/host/load-plugin.js';
import { emptyFolder, openAppEditor, openAppStart } from '../../packages/app/test/app-window.js';
import { Journey, named } from '../../scripts/ux-journey.mjs';
import { EDITED, GRAPH, NOTE, SAYS } from './journey-note.js';

/** A control the person can see, found by its name: one missing fails, naming it. */
function control(root, name) {
  const el = named(root, name);
  assert.ok(el, `the person finds no control called "${name}"`);
  return el;
}

/** Runs the journey on a fresh folder holding the note; gives the Journey, with its counts. */
export async function appJourney() {
  const person = new Journey('app');
  const folder = emptyFolder();
  writeFileSync(join(folder, 'Reader.md'), NOTE);

  person.stage('open the note');
  const start = await openAppStart(folder);
  let page;
  try {
    await until(() => !!named(start.doc, 'Reader.md'), 8000);
    const link = control(start.doc, 'Reader.md');
    // the window follows the link to the editor; a DOM does not, so the editor is opened at the link's address
    const address = await person.use('Reader.md', () => link.getAttribute('href'));
    assert.equal(address, `editor.html#token=app&note=${encodeURIComponent('Reader.md')}`);
  } finally {
    await start.stop();
  }
  page = await openAppEditor(folder, 'Reader.md');
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
