// The states of the browser editor's page, each reached on the page as built in a DOM (editor spec §11, §41). Every
// accessibility check of the page goes through this one list (test/wcag.test.js, test/a11y-semantics.test.js and
// test/a11y-keyboard.test.js). So a state a later workstream adds gets its case here once, and every check covers it.
import { until } from '../../packages/obsidian/test/host/load-plugin.js';
import { browserHost } from '../../packages/claude-code/page/browser-host.ts';
import { PAGE_NOTE } from './wcag-page.js';
import { word } from '@thoughtknot/core';

/**
 * Each state of the page by its name, reached through `open(hash, note, draft)`, and given back. `open` opens the page
 * as the pane opens it (the token and the note in the address), or with neither.
 */
export function pageStates(open) {
  const withNote = '#token=t&note=Reader.md';
  // on a phone the pane opens on its text tab: the drawing is drawn once its tab is chosen, as a person chooses it
  const drawn = async (page) => {
    const doc = page.window.document;
    await until(() => !!doc.querySelector('.thoughtknot-pane-drawing'), 8000);
    doc.querySelector('.thoughtknot-tabs [role="tab"]')?.click();
    await until(() => !!doc.querySelector('.thoughtknot-pane-drawing svg.thoughtknot-svg'), 8000);
  };
  // a link naming a thing that is not there: a problem, listed with its fix, and an estimated link in the drawing
  const SLIPPED = PAGE_NOTE.replace(
    '(large)-[:ANSWERS]->(q)',
    "(large)-[:ANSWERS]->(q),\n(eyes:Reason {title: 'E'}),\n(eyes)-[:FAVOURS]->(larg)",
  );
  const TWO_BLOCKS = `${PAGE_NOTE}\n\`\`\`gql\n// graph: other\n(x:Thing {name: 'X'})\n\`\`\`\n`;

  return {
    'before the note is opened, saying how to open it': async () => open(''),
    'the note: words, a code block, a link, and the graph drawn with its words': async () => {
      const page = open(withNote);
      await drawn(page);
      return page;
    },
    // the editing states (C9): the edit pane of the Obsidian host, which the layer draws on the page
    'the edit pane with a problem listed and marked': async () => {
      const page = open(withNote, SLIPPED);
      await drawn(page);
      // the caret off the problem's line, so it is listed: on its line it is in the fix bar alone (NEURO-4)
      const field = () => page.window.document.querySelector('.thoughtknot-editor textarea');
      await until(() => !!field());
      const text = field();
      text.setSelectionRange(0, 0);
      text.dispatchEvent(new page.window.KeyboardEvent('keyup'));
      await until(() => page.window.document.querySelectorAll('.thoughtknot-pane-problems li').length > 0);
      return page;
    },
    'the edit pane with the picker of two graph blocks': async () => {
      const page = open(withNote, TWO_BLOCKS);
      await drawn(page);
      await until(() => !!page.window.document.querySelector(`select[aria-label="${word('editor.block-picker')}"]`));
      return page;
    },
    'the edit pane with a kept draft offered back': async () => {
      const page = open(withNote, PAGE_NOTE, { text: 'x', against: null });
      await drawn(page);
      await until(() => !page.window.document.querySelector('.thoughtknot-draft').hidden);
      return page;
    },
    'the details of a thing, opened beside the text': async () => {
      const page = open(withNote);
      await drawn(page);
      const box = page.window.document.querySelector('g.node[data-key]');
      box.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await until(() => !!page.window.document.querySelector('.thoughtknot-details'));
      return page;
    },
    'the details of an estimated link, with its quick fix': async () => {
      const page = open(withNote, SLIPPED);
      await drawn(page);
      await until(() => !!page.window.document.querySelector('g.edge[data-estimate]'));
      page.window.document
        .querySelector('g.edge[data-estimate]')
        .dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await until(() => !!page.window.document.querySelector('.thoughtknot-details'));
      return page;
    },
    'the export form open': async () => {
      const page = open(withNote);
      await drawn(page);
      const exporter = () =>
        page.window.document.querySelector(`.thoughtknot-bar button[aria-label="${word('bar.export')}"]`);
      await until(() => !!exporter());
      exporter().click();
      await until(() => !!page.window.document.querySelector('.thoughtknot-export'));
      return page;
    },
    'a notice shown': async () => {
      const page = open(withNote);
      await drawn(page);
      browserHost(page.window).notice('Exported two files.');
      return page;
    },
    'a menu open': async () => {
      const page = open(withNote);
      await drawn(page);
      browserHost(page.window).menu(
        [
          { title: 'Export as SVG', icon: 'download', onClick() {} },
          'separator',
          { title: 'Delete', icon: 'trash', warning: true, onClick() {} },
        ],
        { x: 20, y: 20 },
        page.window.document,
      );
      return page;
    },
    // C8: the keyboard, the text version and reduced motion
    'the skip link focused': async () => {
      const page = open(withNote);
      await drawn(page);
      page.window.document.querySelector('.gn-skip').focus();
      return page;
    },
    'a menu open with the keyboard on its second row': async () => {
      const page = open(withNote);
      await drawn(page);
      const doc = page.window.document;
      browserHost(page.window).menu(
        [
          { title: 'Export as SVG', icon: 'download', onClick() {} },
          { title: 'Copy the address', icon: 'copy', onClick() {} },
        ],
        { x: 20, y: 20 },
        doc,
      );
      doc.activeElement.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      return page;
    },
    'the text version shown': async () => {
      const page = open(withNote);
      await drawn(page);
      await until(() => !!page.window.document.querySelector('.gn-text-version li'));
      return page;
    },
    'reduced motion asked for': async () => {
      const page = open(withNote);
      page.window.matchMedia = (media) => ({
        media,
        matches: /reduced-motion/.test(media),
        addEventListener() {},
        removeEventListener() {},
      });
      await drawn(page);
      return page;
    },
  };
}
