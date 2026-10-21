// The one decision before an export is written (editor spec §16). It is nothing to export, or ask first, or go. It asks
// first because the note is classified above the configured level. A go comes with a file name that is safe on every
// platform. Nothing is written by this; the host
// writes only on a go.
import { afterEach, test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';
import { readNote } from '../src/drawing.ts';
import { exportPlan } from '../src/export-plan.ts';
import { exportScope } from '../src/export-scope.ts';
import { DEFAULT_SETTINGS, settingsFrom } from '../src/settings.ts';

const TEAM = `// graph: team · SOURCE
(alice:Person {name: 'Alice'}),
(bob:Person {name: 'Bob'}),
(core:Team {name: 'Core'}),
(alice)-[:KNOWS]->(bob),
(bob)-[:MEMBER_OF]->(core)`;
const reading = readNote([TEAM]);
const diagram = exportScope(reading, { graph: 'team' });
const around = exportScope(reading, {
  graph: 'team',
  view: { name: 'around_bob', spec: { kind: 'near', id: 'bob', depth: 1 } },
});
const aroundContext = exportScope(reading, {
  graph: 'team',
  view: { name: 'around_bob', spec: { kind: 'near', id: 'bob', depth: 1 } },
  context: true,
});
const nothing = exportScope(reading, {
  graph: 'team',
  view: { name: 'robots', spec: { kind: 'kinds', kinds: ['Robot'] } },
});
const plan = (over = {}) =>
  exportPlan({
    scope: diagram,
    format: 'svg',
    note: 'Trips/Lisbon.md',
    date: '2026-10-11',
    noteClassification: null,
    settings: DEFAULT_SETTINGS,
    ...over,
  });
const SETTINGS = (over) => settingsFrom({ ...DEFAULT_SETTINGS, ...over });

afterEach(() => setLanguage(SOURCE_LANGUAGE));

describe('going ahead', () => {
  // proves: export_two_scopes
  test('names the file after the note, the graph or view, and the day, and puts it next to the note', () => {
    assert.deepEqual(plan(), {
      go: {
        fileName: 'Lisbon-team-2026-10-11.svg',
        folder: 'Trips',
        path: 'Trips/Lisbon-team-2026-10-11.svg',
        format: 'svg',
        companion: null,
      },
    });
    assert.equal(plan({ scope: around }).go.fileName, 'Lisbon-team-around_bob-2026-10-11.svg');
    assert.equal(plan({ scope: aroundContext }).go.fileName, 'Lisbon-team-around_bob-with-context-2026-10-11.svg');
  });

  // proves: export_formats
  test('a PNG gets the same name with its own ending', () => {
    assert.equal(plan({ format: 'png' }).go.fileName, 'Lisbon-team-2026-10-11.png');
    assert.equal(plan({ format: 'png' }).go.format, 'png');
  });

  // proves: export_two_scopes
  test('a note at the top of the vault gets its file at the top', () => {
    const go = plan({ note: 'Lisbon.md' }).go;
    assert.deepEqual([go.folder, go.path], ['', 'Lisbon-team-2026-10-11.svg']);
  });

  // proves: export_companion_note
  test('goes to the folder set for exports, when one is set', () => {
    const go = plan({ settings: SETTINGS({ exportFolder: 'Exports/Images' }) }).go;
    assert.deepEqual([go.folder, go.path], ['Exports/Images', 'Exports/Images/Lisbon-team-2026-10-11.svg']);
  });

  // proves: failed_export
  test('a folder set outside the vault is not used: the file stays next to the note', () => {
    for (const folder of ['../outside', 'a/../../b', '/etc', 'C:\\temp', '..']) {
      const go = plan({ settings: { ...DEFAULT_SETTINGS, exportFolder: folder } }).go;
      assert.equal(go.folder, 'Trips', folder);
    }
  });

  // proves: export_companion_note
  test('gets no companion note unless it is configured, and then only for a file saved in the vault', () => {
    assert.equal(plan().go.companion, null);
    const on = SETTINGS({ companionNote: 'on' });
    assert.deepEqual(plan({ settings: on }).go.companion, {
      fileName: 'Lisbon-team-2026-10-11.md',
      path: 'Trips/Lisbon-team-2026-10-11.md',
    });
    assert.equal(plan({ settings: on, toVault: false }).go.companion, null);
    assert.equal(plan({ settings: on, format: 'png' }).go.companion.fileName, 'Lisbon-team-2026-10-11.md');
  });

  // proves: failed_export
  test('every name is safe on every platform, whatever the note and graph are called', () => {
    const nasty = [
      'a/b',
      'a\\b',
      'a:b',
      'a*b',
      'a?b',
      'a"b',
      'a<b>',
      'a|b',
      '.hidden',
      '..',
      'x.',
      'x ',
      '\u0000\u001f',
      '',
      '   ',
      'é ü',
      'a'.repeat(400),
    ];
    for (const note of nasty) {
      for (const graph of nasty) {
        const { fileName } = plan({
          note: `Dir/${note}.md`,
          scope: { ...diagram, graph },
          settings: SETTINGS({ companionNote: 'on' }),
        }).go;
        const label = JSON.stringify([note, graph]);
        assert.match(fileName, /^[^/\\:*?"<>|\u0000-\u001f]+\.svg$/, label);
        assert.doesNotMatch(fileName, /^[.\s]/, label);
        assert.doesNotMatch(fileName, /[.\s]\.svg$/, label);
        assert.ok(fileName.length <= 150, label);
        assert.match(fileName, /2026-10-11\.svg$/, label);
      }
    }
  });

  // proves: failed_export
  test('a day that is not a day cannot put anything unsafe in a name', () => {
    assert.match(plan({ date: '../../x:y' }).go.fileName, /^[^/\\:]+\.svg$/);
  });
});

describe('nothing to export', () => {
  // proves: empty_export
  test('an empty graph or view says so, and gives no file to write', () => {
    const d = plan({ scope: nothing });
    assert.deepEqual(Object.keys(d), ['nothing']);
    assert.match(d.nothing, /^There is nothing to export: view robots matches nothing/);
    assert.match(d.nothing, /No thing is a Robot/);
    const none = plan({ scope: exportScope(readNote([]), { graph: 'team' }) });
    assert.match(none.nothing, /^There is nothing to export: graph team has no things in this note/i);
    assert.equal('go' in none || 'ask' in none, false);
  });

  // proves: empty_export
  test('is said before a classification is asked about: there is no file to ask over', () => {
    const d = plan({ scope: nothing, noteClassification: 'Restricted' });
    assert.deepEqual(Object.keys(d), ['nothing']);
  });
});

describe('asking first', () => {
  const asked = (classification, over = {}) => plan({ noteClassification: classification, ...over });

  // proves: classified_export
  test('a note classified above the level is asked about, naming its classification and the level, with no file yet', () => {
    const d = asked('Confidential', { settings: SETTINGS({ exportAsksAbove: 'Internal' }) });
    assert.deepEqual(Object.keys(d), ['ask']);
    assert.match(d.ask, /Confidential/);
    assert.match(d.ask, /Internal/);
    assert.match(d.ask, /Trips\/Lisbon\.md/);
    assert.match(d.ask, /\?$/);
  });

  // proves: classified_export
  test('a note at or below the level goes ahead, and so does one with no classification', () => {
    const level = SETTINGS({ exportAsksAbove: 'Internal' });
    for (const c of ['Public', 'Internal', null, '', '   '])
      assert.ok('go' in asked(c, { settings: level }), String(c));
    assert.ok('ask' in asked('Restricted', { settings: level }));
  });

  // proves: classified_export
  test('with the level not changed, the lowest, anything above it is asked about', () => {
    assert.equal(DEFAULT_SETTINGS.exportAsksAbove, 'Public');
    assert.ok('go' in asked('Public'));
    for (const c of ['Internal', 'Confidential', 'Restricted']) assert.ok('ask' in asked(c), c);
  });

  // proves: classified_export
  test('the classifications are the ones set, lowest first, and a name matches whatever its case or spaces', () => {
    const settings = SETTINGS({ classifications: ['Open', 'Closed', 'Secret'], exportAsksAbove: 'Closed' });
    assert.ok('go' in asked(' closed ', { settings }));
    assert.ok('ask' in asked('SECRET', { settings }));
    assert.match(asked('secret', { settings }).ask, /secret/i);
  });

  // proves: classified_export
  test('a classification that is not in the list counts as above every level, and the question says so', () => {
    const d = asked('Top secret', { settings: SETTINGS({ exportAsksAbove: 'Restricted' }) });
    assert.deepEqual(Object.keys(d), ['ask']);
    assert.match(d.ask, /Top secret/);
    assert.match(d.ask, /not one of the classifications/);
    assert.match(d.ask, /Public, Internal, Confidential, Restricted/);
    assert.match(d.ask, /above every level/);
  });

  // proves: classified_export
  test('a level that is no longer a classification asks about every classified note, the lowest too', () => {
    const settings = { ...DEFAULT_SETTINGS, exportAsksAbove: 'Retired' };
    assert.ok('ask' in asked('Public', { settings }));
    assert.ok('go' in asked(null, { settings }));
  });

  // proves: classified_export
  test('once the user has said yes, the file goes ahead, the same file', () => {
    const d = asked('Restricted', { confirmed: true });
    assert.deepEqual(d, plan());
  });

  // proves: classified_export
  test('says yes for a view, a PNG and a companion note as it would for the whole diagram', () => {
    const settings = SETTINGS({ companionNote: 'on' });
    for (const scope of [diagram, around, aroundContext])
      for (const format of ['svg', 'png']) {
        const base = { scope, format, settings, noteClassification: 'Restricted' };
        assert.deepEqual(Object.keys(plan(base)), ['ask']);
        assert.ok(plan({ ...base, confirmed: true }).go.companion);
      }
  });
});

describe('names that are not ASCII', () => {
  const bytes = (s) => new TextEncoder().encode(s).length;
  const japanese = (n) => '日本語のノートの名前'.repeat(n);

  // proves: failed_export
  test('a name is cut by its UTF-8 bytes, so the file name and its .part stay within 200 bytes', () => {
    const long = { ...diagram, graph: japanese(20) };
    const longView = { ...aroundContext, graph: japanese(20), view: 'ビュー'.repeat(60) };
    const emoji = { ...diagram, graph: '🙂'.repeat(100) };
    for (const scope of [diagram, long, longView, emoji])
      for (const format of ['svg', 'png']) {
        const { go } = plan({
          scope,
          format,
          note: `Notes/${japanese(30)}.md`,
          settings: SETTINGS({ companionNote: 'on' }),
        });
        for (const name of [go.fileName, go.companion.fileName]) {
          assert.ok(bytes(name) + '.part'.length <= 200, `${bytes(name)} bytes`);
          assert.doesNotMatch(name, /�/);
          assert.match(name, /2026-10-11\.(svg|png|md)$/);
        }
      }
  });

  // proves: failed_export
  test('each part is cut at a whole character, never in the middle of one', () => {
    const { go } = plan({ note: `${japanese(30)}.md`, scope: { ...diagram, graph: japanese(20) } });
    assert.ok([...go.fileName].every((c) => c === '-' || c === '.' || c === '日' || /[\p{L}\p{N}]/u.test(c)));
    assert.ok(go.fileName.startsWith('日本語のノートの名前'));
  });

  // proves: failed_export
  test('a short Japanese name is kept whole', () => {
    assert.equal(plan({ note: 'Trips/京都.md' }).go.fileName, '京都-team-2026-10-11.svg');
  });
});

describe('where the file goes', () => {
  const folderOf = (note, exportFolder = '') =>
    plan({ note, settings: { ...DEFAULT_SETTINGS, exportFolder } }).go.folder;

  // proves: failed_export
  test('a folder set for exports is not used if a part starts with a dot, so never the config folder', () => {
    for (const odd of ['.obsidian', 'Exports/.obsidian', 'a/.git/b', '.'])
      assert.equal(folderOf('Trips/N.md', odd), 'Trips', odd);
  });

  // proves: failed_export
  test('a folder set for exports is not used if a part is a name Windows reserves, with or without an ending', () => {
    for (const odd of ['con', 'PRN', 'a/aux', 'Nul', 'COM1', 'com9', 'a/lpt1', 'LPT9', 'nul.txt', 'a/com3.old'])
      assert.equal(folderOf('Trips/N.md', odd), 'Trips', odd);
    for (const fine of ['console', 'com10', 'lpt', 'communal/auxiliary', 'my.folder', 'a/b'])
      assert.equal(folderOf('Trips/N.md', fine), fine, fine);
  });

  // proves: failed_export
  test('a folder set for exports is not used if a part ends in a dot or a space', () => {
    for (const odd of ['a.', 'a./b', 'a /b', 'a/b./c']) assert.equal(folderOf('Trips/N.md', odd), 'Trips', odd);
  });

  // proves: failed_export
  test('with no folder set, the file goes in the note’s own folder exactly as given, whatever it is called', () => {
    for (const dir of ['~notes', '.config/x', 'con', 'a /b', 'Trips/2026.', 'a:b']) {
      const { go } = plan({ note: `${dir}/N.md` });
      assert.equal(go.folder, dir, dir);
      assert.equal(go.path, `${dir}/${go.fileName}`, dir);
    }
  });
});

describe('the data, and an image across pages', () => {
  // proves: export_data_formats
  test('the data is named as an image is, with its own ending, and gets its companion note as an image does', () => {
    const on = SETTINGS({ companionNote: 'on' });
    for (const format of ['gql', 'csv', 'graphml']) {
      const { go } = plan({ format, settings: on });
      assert.equal(go.fileName, `Lisbon-team-2026-10-11.${format}`);
      assert.equal(go.path, `Trips/Lisbon-team-2026-10-11.${format}`);
      assert.equal(go.format, format);
      assert.deepEqual(go.companion, {
        fileName: 'Lisbon-team-2026-10-11.md',
        path: 'Trips/Lisbon-team-2026-10-11.md',
      });
      assert.equal(plan({ format }).go.companion, null, 'unless it is configured');
    }
  });

  // proves: big_export
  test('a PNG split across pages names each page, in order, after the one name, and its companion note after that', () => {
    const { go } = plan({ format: 'png', pages: 3, settings: SETTINGS({ companionNote: 'on' }) });
    assert.deepEqual(go.pages, [
      { fileName: 'Lisbon-team-2026-10-11-page-1-of-3.png', path: 'Trips/Lisbon-team-2026-10-11-page-1-of-3.png' },
      { fileName: 'Lisbon-team-2026-10-11-page-2-of-3.png', path: 'Trips/Lisbon-team-2026-10-11-page-2-of-3.png' },
      { fileName: 'Lisbon-team-2026-10-11-page-3-of-3.png', path: 'Trips/Lisbon-team-2026-10-11-page-3-of-3.png' },
    ]);
    assert.equal(go.companion.fileName, 'Lisbon-team-2026-10-11.md');
    assert.equal(plan({ format: 'png' }).go.pages, undefined, 'one page is one file, named as before');
    assert.equal(plan({ format: 'png', pages: 1 }).go.pages, undefined);
  });

  // proves: failed_export
  test('a long name stays within 200 bytes with its .part, whatever its ending and however many pages', () => {
    const bytes = (s) => new TextEncoder().encode(s).length;
    // ASCII fills each part to its last byte; a name not in ASCII is cut at a whole character, so may fall short
    const ascii = [{ ...aroundContext, graph: 'g'.repeat(100), view: 'v'.repeat(100) }, `Notes/${'n'.repeat(200)}.md`];
    const wide = [
      { ...aroundContext, graph: '日本語'.repeat(40), view: 'ビュー'.repeat(60) },
      `Notes/${'名前'.repeat(80)}.md`,
    ];
    for (const [scope, note] of [ascii, wide])
      for (const [format, pages] of [
        ['graphml', undefined],
        ['csv', undefined],
        ['png', 36],
      ]) {
        const { go } = plan({ scope, format, pages, note });
        for (const name of [go.fileName, ...(go.pages ?? []).map((p) => p.fileName)])
          assert.ok(bytes(name) + '.part'.length <= 200, `${name}: ${bytes(name)} bytes`);
      }
  });
});

describe('what the plan says, in the person’s language', () => {
  // proves: words_catalogue
  test('that there is nothing to export, and each question asked first, are said in it', () => {
    setLanguage('en-XA');
    const said = [
      plan({ scope: nothing }).nothing,
      plan({ scope: { ...diagram, empty: true, why: undefined } }).nothing,
      plan({ noteClassification: 'Confidential', settings: SETTINGS({ exportAsksAbove: 'Internal' }) }).ask,
      plan({ noteClassification: 'Top secret', settings: SETTINGS({ exportAsksAbove: 'Restricted' }) }).ask,
      plan({
        noteClassification: 'Internal',
        settings: { ...DEFAULT_SETTINGS, exportAsksAbove: 'Gone' },
      }).ask,
    ];
    for (const words of said) assert.ok(isPseudoWord(words), words);
  });
});
