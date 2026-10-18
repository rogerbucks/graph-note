// The reader of one style thing's properties (style-reader.ts). A word not allowed is reported in the message it is
// given. The word is written in the place of every $ in it, never only the first.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { reader } from '../src/style-reader.ts';

const wordProblem = (written, message) => {
  const out = [];
  const raw = {
    labels: ['Style'],
    props: { direction: written },
    at: { block: 0, line: 3 },
    span: () => undefined,
    keySpan: () => undefined,
  };
  const names = { graph: 'trip' };
  const word = reader(raw, names, out).word('direction', ['TB', 'LR'], message);
  return { word, out };
};

describe('a word not allowed, in the message given for it', () => {
  test('a message with one $ has the word written in its place', () => {
    const { word, out } = wordProblem('sideways', '$ is not a direction the locked style lays out in');
    assert.equal(word, undefined);
    assert.equal(out.length, 1);
    assert.equal(out[0].message, 'sideways is not a direction the locked style lays out in');
  });

  test('a message with two $ has the word written in the place of both', () => {
    const { out } = wordProblem('sideways', '$ is not a direction, and $ cannot be laid out');
    assert.equal(out[0].message, 'sideways is not a direction, and sideways cannot be laid out');
  });

  test('a word holding a $ pattern is written as it is, and not read as one', () => {
    const { out } = wordProblem('a$&b', '$ is not a direction, and $ cannot be laid out');
    assert.equal(out[0].message, 'a$&b is not a direction, and a$&b cannot be laid out');
  });

  test('a word that is allowed reports nothing', () => {
    const { word, out } = wordProblem('LR', '$ is not a direction');
    assert.equal(word, 'LR');
    assert.deepEqual(out, []);
  });
});
