// The headless Chrome the checks in a real browser share (scripts/chrome.mjs). Chrome answers its list of pages before
// its first page is open, with an empty list. So the list is asked again until a page is there.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { firstPage } from '../scripts/chrome.mjs';

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
