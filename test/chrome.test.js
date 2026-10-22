// The headless Chrome the checks in a real browser share (scripts/chrome.mjs). Chrome answers its list of pages before
// its first page is open, with an empty list. So the list is asked again until a page is there.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { firstPage, portOf, removeProfile } from '../scripts/chrome.mjs';

const noWait = async () => {};

describe('the first page of a headless Chrome', () => {
  test('is asked for again while the list is empty or cannot be read, and found once it is there', async () => {
    const answers = [
      () => Promise.reject(new Error('not listening yet')),
      () => [],
      () => [{ type: 'other' }],
      () => [{ type: 'page', id: 'p' }],
    ];
    const page = await firstPage(async () => answers.shift()(), { wait: noWait });
    assert.deepEqual(page, { type: 'page', id: 'p' });
    assert.equal(answers.length, 0);
  });

  test('is said to be missing when no page comes in all the tries', async () => {
    await assert.rejects(
      firstPage(async () => [], { tries: 3, wait: noWait }),
      /Chrome opened no page/,
    );
  });
});

describe('the profile of a headless Chrome, removed when it stops', () => {
  const failing = (code) => () => {
    throw Object.assign(new Error(code), { code });
  };

  test('is left for the system when it is still busy, and any other error is thrown', () => {
    assert.doesNotThrow(() => removeProfile('/tmp/profile', failing('ENOTEMPTY')));
    assert.doesNotThrow(() => removeProfile('/tmp/profile', failing('EBUSY')));
    assert.throws(() => removeProfile('/tmp/profile', failing('EACCES')), { code: 'EACCES' });
  });
});

describe("Chrome's DevTools port", () => {
  const noWait = () => Promise.resolve();
  test('is read from the file Chrome writes, once it is there, so two Chromes never share one', async () => {
    let reads = 0;
    const read = () => {
      reads++;
      if (reads < 3) throw new Error('ENOENT');
      return '41234\n/devtools/browser/abc\n';
    };
    assert.equal(await portOf('/profile', { read, wait: noWait }), 41234);
    assert.equal(reads, 3);
  });
  test('says so when Chrome never writes it', async () => {
    await assert.rejects(portOf('/profile', { read: () => '', wait: noWait, tries: 3 }), /no DevTools port/);
  });
});
