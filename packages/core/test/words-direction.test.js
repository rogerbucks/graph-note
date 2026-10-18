// The direction the interface is read in follows the host (editor spec §42, rtl_mirrors): the direction of its language,
// unless the host says its own, set as a host is installed and given to the root of each view.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { currentDirection, directionOf, setDirection, setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';
import { installHost, readInHostDirection } from '../src/display/host.ts';

const host = (extra = {}) => ({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {}, ...extra });

afterEach(() => {
  setLanguage(SOURCE_LANGUAGE);
  setDirection('ltr');
});

describe('the reading direction', () => {
  test('a language written right to left is read right to left, in each region and script, and every other left to right', () => {
    for (const tag of ['ar', 'ar-EG', 'he', 'he-IL', 'fa', 'ur', 'ps', 'yi', 'ckb', 'dv'])
      assert.equal(directionOf(tag), 'rtl', tag);
    for (const tag of ['en', 'en-GB', 'fr-CA', 'zh-Hans', 'ja', 'hi', 'ru', 'tr', 'az-Latn'])
      assert.equal(directionOf(tag), 'ltr', tag);
  });

  test('a tag that is no language is read left to right', () => {
    assert.equal(directionOf('not a language!'), 'ltr');
    assert.equal(directionOf(''), 'ltr');
  });

  test('is the host’s language’s as the host is installed, or the host’s own when it says one', () => {
    installHost(host({ language: () => 'he-IL' }));
    assert.equal(currentDirection(), 'rtl');
    installHost(host({ language: () => 'en-GB' }));
    assert.equal(currentDirection(), 'ltr');
    installHost(host({ language: () => 'en-GB', direction: () => 'rtl' }));
    assert.equal(currentDirection(), 'rtl');
    installHost(host());
    assert.equal(currentDirection(), 'ltr', 'a host that says nothing is UK English, left to right');
  });

  test('a view’s root is set to read in it', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    installHost(host({ language: () => 'ar' }));
    assert.equal(readInHostDirection(doc.body.appendChild(doc.createElement('div'))).dir, 'rtl');
    installHost(host({ language: () => 'fr' }));
    assert.equal(readInHostDirection(doc.body.appendChild(doc.createElement('div'))).dir, 'ltr');
  });
});
