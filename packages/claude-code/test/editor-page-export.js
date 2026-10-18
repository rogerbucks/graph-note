// The page's export cases (C6, cc_export_same). They are registered by editor-page.test.js, which is test_cc_page's
// file. They are kept here so that file stays within the repository's size baseline. The page exports through the
// shared display layer's Export form and the core's own export. So a file it saves is the file the Obsidian plugin would
// write. It has the same name and the same bytes, with the same question first for a classified note. The page draws
// the PNG. The server only writes what it is handed (editor-export.test.js). Test code only.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';
import { pageSources } from './editor-page-support.js';

/** Registers the cases; `at` makes a repository path absolute, `importsOf` lists the modules a source file imports. */
export function exportSameCases({ at, ROOT, LAYER, importsOf }) {
  describe('C6: the page’s export is the shared export (cc_export_same)', () => {
    const core = (m) => import(at(`packages/core/src/${m}.ts`));
    const DATE = '2026-10-16';
    const NOTE = "// graph: trip\n(a:Place {name: 'Home'}),\n(b:Place {name: 'Park'}),\n(a)-[:NEAR]->(b)";
    const fenced = (body, front = '') => `${front}# Trip\n\n\`\`\`gql\n${body}\n\`\`\`\n`;
    const SAVED = (log, fail) => async (files) => {
      if (fail) return { stopped: fail };
      log.push(files);
      return { written: files.map((f) => f.name) };
    };

    /** The page's export dependencies over the real engine, run on this thread; `log` collects what is saved. */
    async function deps(over = {}) {
      const { LayoutRunner, inThreadPort, serveLayouts } = await core('layout-worker');
      const { loadEngine } = await core('engine');
      const { settingsFrom } = await core('settings');
      const runner = new LayoutRunner({
        page: () => inThreadPort((s) => serveLayouts(s, loadEngine)),
        clock: { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) },
      });
      after(() => runner.close());
      const log = [];
      const base = {
        note: 'Trips/Trip.md',
        text: fenced(NOTE),
        settings: settingsFrom(null),
        folder: 'Trips',
        layout: (d, theme) => runner.draw(d, undefined, theme),
        rasterise: async (svg, size) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, size.width % 256, size.height % 256]),
        save: SAVED(log),
        pixelLimit: 16_777_216,
        device: 'desktop',
        today: () => DATE,
      };
      return { x: { ...base, ...over }, log };
    }
    const ASK = { path: 'Trips/Trip.md', graph: 'trip', format: 'svg', theme: 'light' };
    const run = async (x, ask) => (await import(`${at('packages/claude-code/page')}/export-run.ts`)).runExport(x, ask);
    const reading = async (text) => {
      const { readNote } = await core('drawing');
      const { gqlBlocks } = await core('blocks');
      return readNote(gqlBlocks(text).map((b) => b.text));
    };

    test('an SVG is the very image the core makes, saved under the name the core’s plan gives', async () => {
      const { x, log } = await deps();
      const outcome = await run(x, ASK);
      assert.match(outcome.done, /Exported Trips\/Trip-trip-2026-10-16\.svg/);
      assert.equal(log.length, 1);
      const [file] = log[0];
      const { exportScope } = await core('export-scope');
      const { exportWithLayout } = await core('export');
      const { readStyle } = await core('style');
      const { gqlBlocks } = await core('blocks');
      const read = await reading(x.text);
      const scope = exportScope(read, { graph: 'trip', context: false });
      const texts = gqlBlocks(x.text).map((b) => b.text);
      const image = await exportWithLayout(scope, x.layout, {
        note: 'Trips/Trip.md',
        date: DATE,
        theme: 'light',
        motion: true,
        device: 'desktop',
        style: readStyle(texts, 'trip', read).style,
        data: read.world.trip,
      });
      assert.equal(file.name, 'Trip-trip-2026-10-16.svg');
      assert.equal(file.text, image.svg, 'the core’s own image, byte for byte');
      assert.match(file.text, /From Trips\/Trip\.md/, 'it says which note it is from');
    });

    test('the data formats are the core’s data, a GQL block, CSV and GraphML', async () => {
      const { exportScope } = await core('export-scope');
      const { dataText, exportedData } = await core('export-data');
      for (const format of ['gql', 'csv', 'graphml']) {
        const { x, log } = await deps();
        const outcome = await run(x, { ...ASK, format });
        assert.match(outcome.done, new RegExp(`\\.${format}`));
        const read = await reading(x.text);
        const data = exportedData(read, exportScope(read, { graph: 'trip', context: false }));
        assert.equal(log[0][0].text, dataText(data, format, { note: 'Trips/Trip.md', date: DATE }), format);
        assert.equal(log[0][0].name, `Trip-trip-2026-10-16.${format}`);
      }
    });

    test('the PNG is drawn by the page at the core’s size, and a too large one is split across pages, all saved or none', async () => {
      const { pngSize } = await core('export');
      // a long chain, wide enough to be split across pages
      const items = Array.from({ length: 14 }, (_, i) => `(n${i}:Place {name: 'Stop number ${i}'})`);
      const links = Array.from({ length: 13 }, (_, i) => `(n${i})-[:NEAR]->(n${i + 1})`);
      const wide = fenced(['// graph: trip', [...items, ...links].join(',\n')].join('\n'));
      const { x, log } = await deps({ text: wide });
      const sizes = [];
      x.rasterise = async (svg, size) => (
        sizes.push([svg.slice(0, 4), size]),
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
      );
      const one = await run(x, { ...ASK, format: 'png' });
      assert.match(one.done, /\.png/);
      assert.equal(log[0].length, 1);
      assert.deepEqual(Array.from(log[0][0].bytes), [0x89, 0x50, 0x4e, 0x47], 'the page’s own rasterised bytes');
      assert.equal(sizes[0][0], '<svg');
      const { width, height } = sizes[0][1];
      assert.ok(width >= pngSize(1, 1).width, 'at least twice natural size');
      assert.ok(height > 0);
      // a pixel limit under one image: pages, each its own file, handed over in one save
      const { x: small, log: pages } = await deps({ text: wide, pixelLimit: Math.floor((width * height) / 2) });
      small.rasterise = x.rasterise;
      const many = await run(small, { ...ASK, format: 'png' });
      assert.match(many.done, /pages/);
      assert.equal(pages.length, 1, 'one save for all the pages');
      assert.ok(pages[0].length > 1);
      assert.match(pages[0][0].name, /-page-1-of-\d+\.png$/);
      // one page that cannot be drawn leaves nothing saved
      const { x: broken, log: none } = await deps({ text: wide, pixelLimit: Math.floor((width * height) / 2) });
      let n = 0;
      broken.rasterise = async () => {
        if (++n === 2) throw new Error('the image is too large');
        return Uint8Array.from([1]);
      };
      const stopped = await run(broken, { ...ASK, format: 'png' });
      assert.ok('stopped' in stopped);
      assert.deepEqual(none, []);
    });

    test('a classified note is asked about first, nothing saved, and saved once the person says yes', async () => {
      const { settingsFrom } = await core('settings');
      const settings = settingsFrom({ classifications: ['Public', 'Secret'], exportAsksAbove: 'Public' });
      const { x, log } = await deps({ settings, text: fenced(NOTE, '---\nclassification: Secret\n---\n') });
      const asked = await run(x, ASK);
      assert.match(asked.ask, /classified Secret, above Public/);
      assert.deepEqual(log, [], 'nothing is written before the yes');
      const yes = await run(x, { ...ASK, confirmed: true });
      assert.match(yes.done, /Exported/);
      assert.equal(log.length, 1);
      // a note with no classification is not asked about
      const plain = await deps({ settings });
      assert.match((await run(plain.x, ASK)).done, /Exported/);
    });

    test('a graph with nothing in it exports nothing, and a failed save says nothing was saved', async () => {
      const empty = await deps({ text: fenced('// graph: trip\n') });
      const said = await run(empty.x, ASK);
      assert.match(said.stopped, /nothing to export/i);
      assert.deepEqual(empty.log, []);
      const failing = await deps({
        save: SAVED([], 'The export could not be written: the disk is full. Nothing was saved.'),
      });
      const failed = await run(failing.x, ASK);
      assert.match(failed.stopped, /disk is full/);
    });

    test('the companion note, when set, follows the image under the name it was saved as', async () => {
      const { settingsFrom } = await core('settings');
      const { companionNote } = await core('export-note');
      const { exportScope } = await core('export-scope');
      const { x, log } = await deps({ settings: settingsFrom({ companionNote: 'on' }) });
      x.save = async (files) => {
        log.push(files);
        // the server numbered the image: an earlier export of that name was there
        return { written: files.map((f) => f.name.replace(/\.(\w+)$/, '-2.$1')) };
      };
      const outcome = await run(x, ASK);
      assert.equal(log.length, 2, 'the image, then its note');
      assert.equal(log[1][0].name, 'Trip-trip-2026-10-16-2.md', 'named after the image as it was saved');
      const read = await reading(x.text);
      const note = companionNote({
        image: 'Trips/Trip-trip-2026-10-16-2.svg',
        note: 'Trips/Trip.md',
        date: DATE,
        scope: exportScope(read, { graph: 'trip', context: false }),
      });
      assert.equal(log[1][0].text, note);
      assert.match(outcome.done, /Trip-trip-2026-10-16-2\.svg/);
    });

    test('the form is the shared Export form: SVG, PNG, GQL, CSV, GraphML, light or dark, and the page runs it', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-export-form-'));
      const doc = fakeDocument(700),
        uninstall = installGlobals(doc);
      try {
        const out = await build({
          absWorkingDir: ROOT,
          stdin: {
            contents:
              `export { toggleExportForm } from './${LAYER}/export/export-form.ts'; export { installHost } from './${LAYER}/host.ts';` +
              " export { exportingOf } from './packages/claude-code/page/export-run.ts';",
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
        const { toggleExportForm, installHost, exportingOf } = await import(pathToFileURL(join(dir, 'form.mjs')).href);
        installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
        const { x, log } = await deps();
        const exporting = exportingOf(x, 'trip', 'light');
        assert.deepEqual([exporting.path, exporting.graph, exporting.theme], ['Trips/Trip.md', 'trip', 'light']);
        toggleExportForm(doc.body, exporting);
        const form = doc.body.querySelector('.thoughtknot-export');
        assert.ok(form, 'the Export form');
        const select = (label) => form.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === label);
        assert.deepEqual(
          select('Format').children.map((o) => o.getAttribute('value')),
          ['svg', 'png', 'gql', 'csv', 'graphml'],
        );
        assert.deepEqual(
          select('Theme').children.map((o) => o.getAttribute('value')),
          ['light', 'dark'],
        );
        form
          .querySelectorAll('button')
          .find((b) => b.getAttribute('aria-label') === 'Export it')
          .click();
        for (let i = 0; i < 400 && !log.length; i++) await new Promise((r) => setTimeout(r, 25));
        assert.equal(log[0][0].name, 'Trip-trip-2026-10-16.svg', 'the form’s Export it saved through the page');
      } finally {
        uninstall();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('the page’s export code imports the core and the layer, no Obsidian, and draws its PNG itself', () => {
      const sources = pageSources();
      for (const name of ['export-run.ts', 'export-calls.ts', 'png.ts']) assert.ok(sources[name], name);
      for (const [name, text] of Object.entries(sources))
        for (const from of importsOf(text)) assert.doesNotMatch(from, /obsidian/i, `${name} imports ${from}`);
      assert.match(sources['png.ts'], /toBlob/);
      assert.match(sources['export-calls.ts'], /export\//);
    });
  });
}
