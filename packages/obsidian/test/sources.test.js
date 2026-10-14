// A graph drawn from a .gql file (editor spec §20, gql_file_source, gql_file_missing): a block whose graph line says FROM
// and a file draws the graph written in that file, read through the vault where it is written and never copied into
// the note, drawn again when the file changes; a file that is missing, moved or unreadable is named with why, never a
// blank drawing; and a file too large to read is shown under the same banner as a note's own blocks.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const FILE = 'Graphs/trip.gql';
const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;
const FROM = `// graph: trip · FROM ${FILE}`;
const note = ['# Trip', '', fence(FROM), ''].join('\n');
const keys = (el) => el.querySelectorAll('g.node').map((g) => g.getAttribute('data-key'));
const alertOf = (el) => el.querySelector('[role="alert"]')?.textContent ?? '';

async function card(files) {
  const env = await load({ files: { 'Some note.md': note, ...files } });
  const { el } = await show(env, note, 0);
  return { env, el };
}

describe('a block drawn from a .gql file', () => {
  // proves: gql_file_source
  test('draws the graph the file holds, says which file, and writes nothing into the note', async () => {
    const { env, el } = await card({ [FILE]: TRIP });
    try {
      await until(() => keys(el).length > 0);
      assert.deepEqual(keys(el), ['home', 'park']);
      assert.match(el.querySelector('.graph-note-source').textContent, /Drawn from the file Graphs\/trip\.gql/);
      assert.equal(env.state.writes, undefined);
      assert.equal(env.state.files.get('Some note.md'), note);
    } finally {
      env.uninstall();
    }
  });

  // proves: gql_file_source
  test('is drawn again when the file changes, as it is written there', async () => {
    const { env, el } = await card({ [FILE]: TRIP });
    try {
      await until(() => keys(el).length > 0);
      await env.app.vault.modify(env.app.vault.getFileByPath(FILE), `${TRIP},\n(lake:Place {name: 'The lake'})`);
      await until(() => keys(el).includes('lake'));
      assert.deepEqual(keys(el), ['home', 'park', 'lake']);
    } finally {
      env.uninstall();
    }
  });

  // proves: gql_file_source
  test('a line of the file that cannot be read is left out, and the rest drawn', async () => {
    const { env, el } = await card({ [FILE]: `${TRIP},\n(lake:Place {name: 'x' oops}),\n(cafe:Place {name: 'Cafe'})` });
    try {
      await until(() => keys(el).length > 0);
      assert.deepEqual(keys(el), ['home', 'park', 'cafe']);
    } finally {
      env.uninstall();
    }
  });

  // proves: gql_file_source
  test('a file too large to read is not read, and says so under the banner a note’s blocks get', async () => {
    const { env, el } = await card({ [FILE]: `${TRIP}\n${'// padding\n'.repeat(10_010)}` });
    try {
      assert.match(el.querySelector('.graph-note-banner').textContent, /too large to read/i);
      assert.equal(el.querySelector('svg'), null);
    } finally {
      env.uninstall();
    }
  });
});

describe('a .gql file missing, moved or unreadable', () => {
  // proves: gql_file_missing
  test('a missing file is named, and why, with the block shown as text, never a blank drawing', async () => {
    const { env, el } = await card({});
    try {
      assert.match(
        alertOf(el),
        /The file Graphs\/trip\.gql is not in the vault, so graph trip cannot be drawn from it/,
      );
      assert.equal(el.querySelector('svg'), null);
      assert.match(el.querySelector('code').textContent, /FROM Graphs\/trip\.gql/);
    } finally {
      env.uninstall();
    }
  });

  // proves: gql_file_missing
  test('a moved file is named, with where a file of that name is now', async () => {
    const { env, el } = await card({ 'Archive/trip.gql': TRIP });
    try {
      assert.match(alertOf(el), /is not there any more: a file of that name is at Archive\/trip\.gql/);
    } finally {
      env.uninstall();
    }
  });

  // proves: gql_file_missing
  test('a file moved away while it is drawn is said at once', async () => {
    const { env, el } = await card({ [FILE]: TRIP });
    try {
      await until(() => keys(el).length > 0);
      await env.app.vault.rename(env.app.vault.getFileByPath(FILE), 'Old/trip.gql');
      await until(() => /not there any more/.test(alertOf(el)));
      assert.match(alertOf(el), /a file of that name is at Old\/trip\.gql/);
      assert.equal(el.querySelector('svg'), null);
    } finally {
      env.uninstall();
    }
  });

  // proves: gql_file_missing
  test('an unreadable file is named, with the reason it could not be read', async () => {
    const env = await load({ files: { 'Some note.md': note, [FILE]: TRIP } });
    env.app.vault.cachedRead = async () => {
      throw new Error('EACCES: permission denied');
    };
    try {
      const { el } = await show(env, note, 0);
      assert.match(alertOf(el), /The file Graphs\/trip\.gql could not be read \(EACCES: permission denied\)/);
    } finally {
      env.uninstall();
    }
  });
});
