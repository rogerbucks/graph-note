// No language, locale or direction changes a byte the editor writes (editor spec §42, locale_never_changes_bytes).
// That covers an edit to a note, the data of an export and the layout source. Each is made once in UK English. Then
// it is made again under each other setting, and the two must be the same, byte for byte.
// The settings are chosen to catch a slip. A test language changes every word. Arabic is read right to left. German
// and Arabic write numbers their own way. Swedish and Turkish sort and change case their own way.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { addThing, suggestName } from '../src/add-thing.ts';
import { importedBlock } from '../src/db-import.ts';
import { readNote } from '../src/drawing.ts';
import { DATA_FORMATS, dataText, exportedData } from '../src/export-data.ts';
import { exportScope } from '../src/export-scope.ts';
import { setProperty } from '../src/inspector.ts';
import { layoutSource } from '../src/layout.ts';
import { applyChanges, renamedLinks } from '../src/link-renames.ts';
import { DEFAULT_LOCALE, setLocale } from '../src/locale-formats.ts';
import { setNote } from '../src/note-edit.ts';
import { directions } from '../src/render.ts';
import { styleEdit } from '../src/style-edit.ts';
import { addView, makeView } from '../src/view-write.ts';
import { SOURCE_LANGUAGE, setDirection, setLanguage } from '../src/words.ts';

// Names that sort, change case and hold numbers differently from one locale to the next.
const BLOCK = `// graph: team
(zoe:Person {name: 'Zoë', age: 12345.5, joined: '2026-10-11', link: '[[Plans]]'}),
(angstrom:Person {name: 'Ångström', age: 7}),
(emile:Person {name: 'Émile', title: 'İstanbul ışık'}),
(zebra:Person {name: 'zebra', age: -0.25}),
(zoe)-[:KNOWS {since: 1999}]->(emile),
(angstrom)-[:KNOWS]->(zebra)`;
const NOTE = ['# The team', '', '```gql', BLOCK, '```', '', 'See [[Plans]].', ''].join('\n');
const INFO = { note: 'Teams/Team.md', date: '2026-10-11' };

/** Everything the editor writes for the one note, as text, in whatever setting holds now. */
function written() {
  const reading = readNote([BLOCK]);
  const out = {
    note: setNote(BLOCK, { thing: 'zoe' }, 'Joined in 2026.\nLeads 12,345 people.'),
    property: setProperty(BLOCK, 'team', { thing: 'zebra' }, 'score', '1234567.891'),
    linkProperty: setProperty(BLOCK, 'team', { link: 0 }, 'since', '2001'),
    nudge: styleEdit(NOTE, 'team', { nudge: { word: 'beside', thing: 'zoe', other: 'emile' } }),
    direction: styleEdit(NOTE, 'team', { nudge: { word: 'direction', direction: 'TB' } }),
    group: styleEdit(NOTE, 'team', { nudge: { word: 'group', thing: 'zoe', group: 'Équipe İ' } }),
    name: suggestName(reading, 'team', 'Ölçü İçin', 'Person'),
    added: addThing(reading, 'team', BLOCK, { text: 'Ölçü İçin', kind: 'Person' }),
    view: addView(NOTE, 'team', makeView('team', 'people', { kind: 'kinds', kinds: ['Person'] }).block),
    renamed: applyChanges(NOTE, renamedLinks(NOTE, 'Plans.md', 'Trip plans.md')),
    imported: importedBlock('team', [{ id: 'zoe', kind: 'Person', age: '12345.5' }], [], {
      file: 'Teams.db',
      date: INFO.date,
    }),
  };
  const data = exportedData(reading, exportScope(reading, { graph: 'team' }));
  const exports = Object.fromEntries(DATA_FORMATS.map((f) => [f, dataText(data, f, INFO)]));
  const drawing = reading.graphs.get('team');
  const layout = {
    LR: layoutSource(drawing, 'LR').source,
    TB: layoutSource(drawing, 'TB').source,
    laid: directions(drawing).map((d) => [d.rankdir, d.dot]),
  };
  return { ...out, exports, layout };
}

/** The language, the direction it is read in, then the locale and its time zone. */
const SETTINGS = [
  ['en-XA', 'ltr', 'en-GB'],
  ['en-GB', 'rtl', 'en-GB'],
  ['ar-XB', 'rtl', 'ar-EG', 'Africa/Cairo'],
  ['ar', 'rtl', 'ar-SA', 'Asia/Riyadh'],
  ['de', 'ltr', 'de-DE', 'Europe/Berlin'],
  ['sv', 'ltr', 'sv-SE', 'Europe/Stockholm'],
  ['tr', 'ltr', 'tr-TR', 'Europe/Istanbul'],
  ['ja', 'ltr', 'ja-JP-u-ca-japanese', 'Asia/Tokyo'],
  ['hi', 'ltr', 'hi-IN-u-nu-deva', 'Pacific/Kiritimati'],
];

/** UK English, read left to right, as everything is until a host says otherwise. */
function asSource() {
  setLanguage(SOURCE_LANGUAGE);
  setDirection('ltr');
  setLocale(DEFAULT_LOCALE);
}

after(asSource);

describe('what the editor writes', () => {
  asSource();
  const source = written();

  // proves: locale_never_changes_bytes
  test('is the same for the note when made in UK English: each edit was written, not refused', () => {
    for (const key of ['note', 'property', 'linkProperty']) assert.equal(source[key].ok, true, key);
    for (const key of ['nudge', 'direction', 'group', 'added', 'view', 'imported'])
      assert.ok(!('refused' in source[key]), `${key}: ${source[key].refused}`);
    assert.ok(source.renamed.includes('[[Trip plans]]'), 'the link was renamed');
    for (const f of DATA_FORMATS) assert.ok(source.exports[f].includes('Zoë'), f);
  });

  for (const [language, direction, locale, zone] of SETTINGS)
    // proves: locale_never_changes_bytes
    test(`is byte for byte the same in ${language}, read ${direction}, with the locale ${locale}`, () => {
      setLanguage(language);
      setDirection(direction);
      setLocale(locale, zone);
      try {
        assert.deepEqual(written(), source);
      } finally {
        asSource();
      }
    });
});
