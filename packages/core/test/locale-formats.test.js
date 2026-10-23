// Numbers, sizes, dates and lists shown in the reader's locale (editor spec §42, locale_formats), through the platform's
// formatters. UK English is used until a host says another, with the same words as before for UK English. Each host
// says it by the language it is installed with: Obsidian's own, the browser's, the system's for the desktop app.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentLocale,
  DEFAULT_LOCALE,
  formatCount,
  formatDay,
  formatInstant,
  formatList,
  formatSize,
  setLocale,
} from '../src/locale-formats.ts';
import { installHost } from '../src/display/host.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';

afterEach(() => {
  setLocale(DEFAULT_LOCALE);
  setLanguage(SOURCE_LANGUAGE);
});

/** A host that says only its language, or none. */
const host = (language) => ({
  icon: () => {},
  isPhone: () => false,
  notice: () => {},
  menu: () => {},
  ...(language && { language: () => language }),
});

describe('shown in the reader’s locale', () => {
  test('until a host says another, it is UK English, with the words every message had before', () => {
    assert.equal(currentLocale(), 'en-GB');
    assert.equal(formatCount(12345), '12,345');
    assert.deepEqual([100, 12_500, 1_234_567].map(formatSize), ['100 bytes', '12.5 kB', '1.2 MB']);
    assert.equal(formatDay('2026-10-17'), '17 October 2026');
    assert.equal(formatList(['GQL', 'CSV', 'GraphML']), 'GQL, CSV and GraphML');
    assert.equal(formatList(['GQL', 'CSV'], 'disjunction'), 'GQL or CSV');
  });

  test('another locale groups digits, writes decimals, days and lists its own way', () => {
    assert.equal(setLocale('de-DE'), 'de-DE');
    assert.equal(formatCount(12345), '12.345');
    assert.equal(formatSize(12_500), '12,5 kB');
    assert.equal(formatDay('2026-10-17'), '17. Oktober 2026');
    assert.equal(formatList(['a', 'b', 'c']), 'a, b und c');
  });

  test('a locale written right to left formats in its own digits and words', () => {
    setLocale('ar-EG');
    assert.notEqual(formatCount(12345), '12,345');
    assert.match(formatCount(12345), /[٠-٩]/, 'Arabic-Indic digits');
  });

  test('an instant is shown in the time zone the host gives', () => {
    const at = new Date(Date.UTC(2026, 9, 17, 23, 30));
    setLocale('en-GB', 'UTC');
    assert.match(formatInstant(at), /17 Oct 2026, 23:30/);
    setLocale('en-GB', 'Australia/Brisbane');
    assert.match(formatInstant(at), /18 Oct 2026, 09:30/);
  });

  test('a tag the platform does not know falls back to UK English, never throws', () => {
    assert.equal(setLocale('not a locale'), 'en-GB');
    assert.equal(formatCount(1000), '1,000');
  });

  test('a day that is not YYYY-MM-DD is shown as written', () => {
    assert.equal(formatDay('sometime'), 'sometime');
  });

  test('follows the language of the host installed, and a host that says none is UK English', () => {
    installHost(host('de-DE'));
    assert.equal(currentLocale(), 'de-DE');
    assert.equal(formatCount(12345), '12.345');
    installHost(host('ar-EG'));
    assert.equal(currentLocale(), 'ar-EG');
    installHost(host());
    assert.equal(currentLocale(), 'en-GB');
    assert.equal(formatCount(12345), '12,345');
    installHost(host('en'));
    assert.equal(currentLocale(), 'en-GB', 'English with no region is the source’s UK English');
    assert.equal(formatList(['a', 'b', 'c']), 'a, b and c');
  });
});
