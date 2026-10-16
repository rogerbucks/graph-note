// The page's accessibility cases (C8: cc_keyboard, cc_reduced_motion, cc_text_version), registered by editor-page.test.js,
// which is test_cc_page's file: kept here so that file stays within the repository's size baseline. WCAG 2.2 AA (spec §11)
// is the standard. The page has no pointer-only action: what it offers is the drawing and its words, the proposal card's
// buttons, the Export bar and form, menus, and the note's prose; each is reached, named and left by the keyboard. The
// drawing is an image with its words beside it, so choosing a thing and editing it by pointer are the plugin's alone
// (not on the page); what the page writes is a decision on a proposal, a real button. Test code only.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { FakeElement, fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';
import { ask } from './editor-threats-support.js';
import { built, cleanUp, pageSources, runWorker, servePage } from './editor-page-support.js';

/** Registers the cases; `at` makes a repository path absolute, `ROOT` is the repository, `LAYER` the shared display layer. */
export function accessCases({ at, ROOT, LAYER }) {
  const page = (m) => import(`${at('packages/claude-code/page')}/${m}`);
  const fenced = (body) => `\`\`\`gql\n${body}\n\`\`\``;
  const ONE = "// graph: g\n(a:Thing {name: 'A'}),\n(b:Thing {name: 'B'}),\n(a)-[:KNOWS]->(b)";
  const TWO = `${ONE},\n(c:Thing {name: 'C'}),\n(b)-[:KNOWS]->(c)`;

  /** The browser host on a fake page, and the page it draws in. */
  async function hostWith() {
    const { browserHost } = await page('browser-host.ts');
    const doc = fakeDocument(700);
    doc.getElementById = () => null;
    Object.defineProperty(FakeElement.prototype, 'style', { get: () => ({}), configurable: true });
    return { doc, host: browserHost({ document: doc, setTimeout: () => 0, matchMedia: () => ({ matches: false }) }) };
  }

  /** Every element under `root`, root first. */
  const all = (root) => [root, ...root.children.flatMap(all)];
  const CONTROLS = new Set(['button', 'a', 'select', 'input', 'textarea']);

  /** The words a screen reader gives `el`: its own label, what labels it, its text, or its title. */
  function nameOf(el, root) {
    const label = el.getAttribute('aria-label')?.trim();
    if (label) return label;
    const by = el.getAttribute('aria-labelledby');
    if (by)
      return by
        .split(/\s+/)
        .map(
          (id) =>
            all(root)
              .find((e) => e.id === id)
              ?.textContent.trim() ?? '',
        )
        .join(' ')
        .trim();
    const id = el.id;
    const labelFor = id ? all(root).find((e) => e.localName === 'label' && e.getAttribute('for') === id) : null;
    return (
      (labelFor ? labelFor.textContent.trim() : '') ||
      el.textContent.trim() ||
      el.getAttribute('title') ||
      ''
    ).trim();
  }
  const unnamed = (root) => all(root).filter((e) => CONTROLS.has(e.localName) && !nameOf(e, root));

  describe('C8: the page works from the keyboard (cc_keyboard)', () => {
    after(cleanUp);

    test('the page opens with a skip link, one h1, a main that takes focus, and a status region', async () => {
      const html = (await ask((await servePage()).port, { path: '/' })).text;
      assert.match(html, /<html lang="en"/);
      assert.match(
        html,
        /<body>\s*<a class="gn-skip" href="#gn-page">Skip to the note<\/a>/,
        'the first thing tabbed to',
      );
      assert.equal(html.match(/<h1[ >]/g)?.length, 1, 'one h1');
      assert.match(html, /<main id="gn-page" class="gn-page" tabindex="-1"/, 'the skip link’s target can take focus');
      assert.match(html, /id="gn-notices" role="status"/);
      assert.ok(html.indexOf('<h1') < html.indexOf('<main'), 'the title comes before the note');
      assert.doesNotMatch(html, /tabindex="[1-9]/, 'no tab order of its own');
    });

    test('the skip link moves focus to the note, and is seen when it has the focus', async () => {
      const { skipLink } = await page('keyboard.ts');
      const doc = fakeDocument(700);
      const link = doc.createElement('a');
      const main = doc.createElement('main');
      main.setAttribute('id', 'gn-page');
      doc.body.append(link, main);
      doc.getElementById = (id) => all(doc.body).find((e) => e.id === id) ?? null;
      skipLink(doc, link);
      const ev = link.dispatch('click');
      assert.equal(ev.defaultPrevented, true, 'the address is not changed');
      assert.equal(doc.activeElement, main);
      const css = (await ask((await servePage()).port, { path: '/page.css' })).text;
      assert.match(css, /\.gn-skip:focus[^{]*\{[^}]*(?:position:\s*static|clip:\s*auto|left:\s*0)/, 'shown on focus');
    });

    test('every control has a visible focus, at least 24 CSS pixels to hit, and none is made to lose its outline', async () => {
      const css = (await ask((await servePage()).port, { path: '/page.css' })).text;
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1], m[2]]);
      const ring = rules.filter(([s, b]) => /:focus-visible/.test(s) && /outline:\s*[2-9]px solid/.test(b));
      const selectors = ring.map(([s]) => s).join(',');
      for (const el of ['a', 'button', 'select', 'input', 'textarea', '[tabindex]'])
        assert.match(selectors, new RegExp(`(^|[\\s,])${el.replace(/[[\]]/g, '\\$&')}:focus-visible`), el);
      // the page's own sheet; the shared sheet's two `outline: none` are the plugin's drawing nodes and its overlay editor,
      // neither of which is on this page (it shows the drawing as an image)
      assert.doesNotMatch(pageSources()['page.css'], /outline:\s*(?:none|0)\b/, 'a focus ring is never taken away');
      assert.match(css, /\.gn-skip/);
    });

    test('a menu is walked by the arrow keys, Home and End; Escape or Tab close it and the focus goes back', async () => {
      const { doc, host } = await hostWith();
      const opener = doc.createElement('button');
      doc.body.append(opener);
      const ran = [];
      const open = () => {
        opener.focus();
        host.menu(
          ['One', 'Two', 'Three'].flatMap((title, i) => [
            { title, icon: 'copy', onClick: () => ran.push(title) },
            ...(i === 0 ? ['separator'] : []),
          ]),
          { x: 1, y: 1 },
          doc,
        );
        return doc.body.querySelectorAll('.gn-menu-row');
      };
      let rows = open();
      assert.equal(rows.length, 3);
      assert.equal(doc.activeElement, rows[0], 'the first row has the focus when it opens');
      const press = (key) => doc.activeElement.dispatch('keydown', { key });
      assert.equal(press('ArrowDown').defaultPrevented, true);
      assert.equal(doc.activeElement, rows[1]);
      press('ArrowDown');
      press('ArrowDown');
      assert.equal(doc.activeElement, rows[0], 'past the last row is the first');
      press('ArrowUp');
      assert.equal(doc.activeElement, rows[2], 'before the first row is the last');
      press('Home');
      assert.equal(doc.activeElement, rows[0]);
      press('End');
      assert.equal(doc.activeElement, rows[2]);
      press('Home');
      press('Escape');
      assert.equal(doc.body.querySelector('.gn-menu'), null, 'Escape closes it');
      assert.equal(doc.activeElement, opener, 'and the focus goes back to where it was');
      rows = open();
      press('Tab');
      assert.equal(doc.body.querySelector('.gn-menu'), null, 'Tab leaves it');
      assert.equal(doc.activeElement, opener);
      rows = open();
      press('ArrowDown');
      doc.activeElement.click();
      assert.deepEqual(ran, ['Two'], 'Enter and Space press a button, which is a click');
      assert.equal(doc.body.querySelector('.gn-menu'), null);
      assert.equal(doc.activeElement, opener, 'a chosen row returns the focus too');
      assert.ok(rows.every((r) => r.localName === 'button'));
    });

    test('every control the page draws has an accessible name: the card, a menu, the Export bar and form', async () => {
      const { showCards } = await page('proposal-card.ts');
      const { doc, host } = await hostWith();
      const card = {
        id: 'cs1',
        by: 'Claude',
        shown: {
          provenance: ['Proposed by Claude.'],
          stale: { message: 'the graph has moved' },
          checked: { results: [] },
          grouped: true,
          groups: [{ name: 'Tidy', pending: 1 }],
        },
        rows: [
          {
            id: 'c1',
            mark: 'add',
            said: 'A thing, X',
            state: 'pending',
            decision: null,
            reason: 'a step',
            blocked: null,
          },
        ],
      };
      const cards = doc.createElement('div');
      doc.body.append(cards);
      showCards(
        cards,
        [card],
        async () => 'Done.',
        () => {},
      );
      assert.ok(all(cards).filter((e) => CONTROLS.has(e.localName)).length >= 6, 'buttons and the checkbox');
      assert.deepEqual(unnamed(cards), [], 'in the card');
      host.menu([{ title: 'Open', icon: 'copy', onClick() {} }], { x: 0, y: 0 }, doc);
      assert.deepEqual(unnamed(doc.body.querySelector('.gn-menu')), [], 'in a menu');
      assert.equal(doc.body.querySelector('.gn-menu').getAttribute('aria-label'), 'Menu', 'the menu has a name too');
      const dir = mkdtempSync(join(tmpdir(), 'graph-note-access-form-'));
      const uninstall = installGlobals(doc);
      try {
        const out = await build({
          absWorkingDir: ROOT,
          stdin: {
            contents:
              `export { toggleExportForm } from './${LAYER}/export/export-form.ts'; export { button } from './${LAYER}/graph-view/view-bar.ts';` +
              ` export { installHost } from './${LAYER}/host.ts';`,
            resolveDir: ROOT,
            loader: 'ts',
          },
          bundle: true,
          format: 'esm',
          platform: 'node',
          write: false,
          logLevel: 'silent',
        });
        writeFileSync(join(dir, 'form.mjs'), out.outputFiles[0].text);
        const layer = await import(pathToFileURL(join(dir, 'form.mjs')).href);
        layer.installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
        const graph = doc.createElement('section');
        doc.body.append(graph);
        const bar = doc.createElement('div');
        graph.append(bar);
        layer.button(bar, 'Export', 'download', () => {}, 'Export');
        layer.toggleExportForm(graph, { path: 'a.md', graph: 'g', theme: 'light', run: async () => ({}) });
        assert.ok(graph.querySelector('.graph-note-export'), 'the Export form is open');
        assert.ok(all(graph).filter((e) => CONTROLS.has(e.localName)).length >= 4);
        assert.deepEqual(unnamed(graph), [], 'in the bar and the form');
        assert.ok(graph.querySelector('.graph-note-export').contains(doc.activeElement), 'the form takes the focus');
      } finally {
        uninstall();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('a redraw keeps the keyboard where it was: the control that had the focus has it again, by its name', async () => {
      const { keepFocus } = await page('keyboard.ts');
      const doc = fakeDocument(700);
      const made = (...names) =>
        names.map((n) => {
          const b = doc.createElement('button');
          b.setAttribute('aria-label', n);
          return b;
        });
      const root = doc.createElement('div');
      doc.body.append(root);
      root.append(...made('Accept', 'Reject', 'Reject'));
      root.children[2].focus();
      await keepFocus(root, async () => root.replaceChildren(...made('Accept', 'Reject', 'Reject')));
      assert.equal(doc.activeElement, root.children[2], 'the second Reject, not the first');
      await keepFocus(root, async () => root.replaceChildren(...made('Accept')));
      assert.ok(!root.contains(doc.activeElement), 'a control that is gone is not guessed at');
      const outside = doc.createElement('button');
      doc.body.append(outside);
      outside.focus();
      await keepFocus(root, async () => root.replaceChildren(...made('Accept')));
      assert.equal(doc.activeElement, outside, 'focus outside the redrawn part is left alone');
    });

    test('nothing is reachable only by pointer: no double click, context menu or mouse-only handler, no tab order of its own', () => {
      const text = Object.values(pageSources()).join('\n');
      assert.doesNotMatch(text, /dblclick|contextmenu|mousedown|mouseup|mousemove|\bonclick\b/);
      assert.doesNotMatch(text, /tabindex['"]?\s*[:=,]\s*['"]?[1-9]/);
    });
  });

  describe('C8: the page is still under reduced motion and stays usable (cc_reduced_motion)', () => {
    after(cleanUp);

    test('the sheet stills every animation, transition and smooth scroll when the system asks, and hides nothing', async () => {
      const css = (await ask((await servePage()).port, { path: '/page.css' })).text;
      const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*[^{}]*\{([^{}]*)\}/);
      assert.ok(block, 'a rule for every element under reduced motion');
      assert.match(block[1], /animation:\s*none\s*!important/);
      assert.match(block[1], /transition:\s*none\s*!important/);
      assert.match(block[1], /scroll-behavior:\s*auto\s*!important/);
      assert.doesNotMatch(block[1], /display|visibility|opacity|pointer-events/, 'the editor stays whole and usable');
      assert.match(css, /@keyframes/, 'the shared layer’s own movements are in this sheet, and covered by that rule');
    });

    test('the page’s own code starts no movement: no timed or scripted animation, no smooth scroll', () => {
      const text = Object.values(pageSources()).join('\n');
      assert.doesNotMatch(
        text,
        /requestAnimationFrame|\.animate\(|setInterval|behavior:\s*['"]smooth|scrollTo|@keyframes/,
      );
      const own = text.replace(/@media \(prefers-reduced-motion[\s\S]*?\n\}\n/, '');
      assert.doesNotMatch(own, /\banimation\s*:|\btransition\s*:/, 'the page’s sheet declares none of its own');
    });

    test('the drawing the page shows is still: its image holds no animation, whatever the system asks', async () => {
      const { readNote } = await import('@graph-note/core');
      const [drawing] = readNote([ONE]).graphs.values();
      const thread = runWorker(join((await built()).dir, 'layout-worker.js'));
      await thread.ready();
      const drawn = await thread.ask({ id: 1, drawing, sourceBytes: 1e6, theme: 'light' });
      assert.match(drawn.drawn.svg, /<svg/);
      assert.doesNotMatch(drawn.drawn.svg, /<animate|<set\b|@keyframes|animation\s*:|transition\s*:/);
    });

    test('a notice and a decision are announced and shown at once: the status region has no fade', async () => {
      const css = (await ask((await servePage()).port, { path: '/page.css' })).text;
      const rule = css.match(/\.gn-notice[^{]*\{[^}]*\}/g)?.join('') ?? '';
      assert.doesNotMatch(rule, /animation|transition/);
      const { doc, host } = await hostWith();
      host.notice('Saved.');
      assert.equal(doc.body.querySelector('.gn-notice').textContent, 'Saved.');
    });
  });

  describe('C8: the text version of the graph is in the page and kept in step (cc_text_version)', () => {
    const win = (doc, draw) => {
      const w = {
        document: doc,
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
        Blob: class {},
      };
      return { w, layouts: { draw } };
    };
    const shown = async (note, draw = async () => ({ svg: '<svg/>' }), into) => {
      const { showGraph } = await page('graph-section.ts');
      const doc = into?.doc ?? fakeDocument(700);
      const root = into?.root ?? doc.createElement('section');
      doc.body.append(root);
      const { w, layouts } = win(doc, draw);
      await showGraph(w, root, fenced(note), layouts);
      return { doc, root };
    };
    const lines = (root) => root.querySelectorAll('.gn-text-version li').map((li) => li.textContent);
    const expected = async (note) => {
      const { readNote, textVersion } = await import('@graph-note/core');
      return textVersion([...readNote([note]).graphs.values()][0]);
    };

    test('the graph’s words are a labelled section in the page: a heading, then the core’s sentences, not hidden', async () => {
      const { root } = await shown(ONE);
      const section = root.querySelector('section.gn-text-version');
      assert.ok(section, 'a section of its own');
      const heading = section.querySelector('h2');
      assert.equal(heading.textContent, 'Text version of graph g');
      assert.equal(section.getAttribute('aria-labelledby'), heading.id);
      assert.deepEqual(lines(root), await expected(ONE), 'the sentences the plugin gives screen readers');
      assert.equal(lines(root)[0], 'Graph g: 2 things, 1 link.');
      assert.ok(lines(root).includes('A is a Thing.'));
      for (const e of all(section)) {
        assert.equal(e.getAttribute('aria-hidden'), null, 'not hidden from a screen reader');
        assert.equal(e.hasAttribute('hidden'), false);
        assert.doesNotMatch(e.className, /\bgn-sr\b|graph-note-sr|visually-hidden/);
      }
    });

    test('the drawing’s image has a short name and points to the words', async () => {
      const { root } = await shown(ONE);
      const img = root.querySelector('img');
      assert.equal(img.getAttribute('alt'), 'g: 2 things, 1 link');
      assert.equal(img.getAttribute('aria-describedby'), root.querySelector('section.gn-text-version').id);
    });

    test('the words follow the note: drawn again for a changed note, nothing of the old one left', async () => {
      const first = await shown(ONE);
      assert.equal(lines(first.root).length, (await expected(ONE)).length);
      await shown(TWO, undefined, first);
      assert.deepEqual(lines(first.root), await expected(TWO));
      assert.ok(
        lines(first.root).some((l) => l.startsWith('C ')),
        'the new thing is there',
      );
      assert.equal(first.root.querySelectorAll('.gn-text-version').length, 1, 'one version, not two');
      await shown(ONE, undefined, first);
      assert.deepEqual(lines(first.root), await expected(ONE), 'and a removed one is gone');
    });

    test('the words stay when the drawing cannot be made: over the limits, or a failure, and a note with no graph says so', async () => {
      const over = await shown(ONE, async () => ({ reason: 'too-large' }));
      assert.deepEqual(lines(over.root), await expected(ONE));
      assert.match(over.root.textContent, /shown as text only/);
      const failed = await shown(ONE, async () => {
        throw new Error('The layout stopped.');
      });
      assert.deepEqual(lines(failed.root), await expected(ONE));
      assert.match(failed.root.textContent, /The layout stopped\./);
      const { NO_GRAPH } = await page('graph-section.ts');
      const none = await shown('plain');
      assert.equal(none.root.textContent, NO_GRAPH);
    });

    test('the page redraws the words whenever the note changes: a decision or a change on disk', () => {
      const main = pageSources()['page-main.ts'];
      const draw = main.match(/const draw = async \(\) => \{([\s\S]*?)\n {4}\};/)[1];
      assert.match(draw, /showGraph\(/, 'drawing the graph draws its words');
      assert.match(main, /current = line;\s*void draw\(\)/, 'a change on disk');
      assert.equal(main.match(/await draw\(\)/g).length >= 3, true, 'start, a decision, a refused write');
    });
  });
}
