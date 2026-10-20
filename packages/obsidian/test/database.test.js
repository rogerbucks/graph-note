// Import from a database (editor spec §20, db_import_on_request; §21, settings_db_connections; §13,
// offline_and_mobile_apis).
// - The database is a SQLite file in the vault. Import offers each one, with nothing to set up and no password kept.
// - It reads the file only when Import is pressed, on desktop and mobile alike, on the device: no network is reached.
// - It writes the rows into the note as a graph block of text. It keeps no live link: drawing the note never reads the
//   file again, and the file itself is never written.
// The plugin's own SQLite engine runs here, the one bundled into main.js, on files made by sql.js in the test.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { build, load, until } from './host/load-plugin.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Sales.md';
const NOTE = '# Sales\n\nThe customers, as the database had them.\n';
const DB = 'Data/sales.sqlite';

/** A SQLite file's bytes: two customers, one with a logo, and one referral between them. */
async function salesFile() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`create table customers (id text, kind text, name text, logo blob);
    insert into customers values ('acme', 'Customer', 'Acme', x'89504e47'), ('bolt', 'Customer', 'Bolt', null);
    create table referrals ("from" text, type text, "to" text);
    insert into referrals values ('acme', 'REFERRED', 'bolt');`);
  const bytes = db.export();
  db.close();
  return bytes;
}

/** The plugin loaded with the note open in front and the database in the vault. Each read and fetch is recorded. */
async function open({ files = {}, ...options } = {}) {
  const bytes = await salesFile();
  const env = await load({ files: { [PATH]: NOTE, [DB]: bytes, ...files }, ...options });
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
  env.bytes = bytes;
  env.reads = [];
  const real = env.plugin.queryDatabase;
  env.plugin.queryDatabase = (file, queries) => {
    env.reads.push(queries);
    return real(file, queries);
  };
  env.fetched = [];
  env.fetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    env.fetched.push(String(args[0]));
    return Promise.reject(new Error('no network in this test'));
  };
  const uninstall = env.uninstall;
  env.uninstall = () => {
    globalThis.fetch = env.fetch;
    uninstall();
  };
  return env;
}

const row = (el, name) =>
  el.querySelectorAll('.setting-item').find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const button = (el, label) => el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const command = (env) => env.state.commands.find((c) => c.id === 'import-from-database');
const dialog = (env) => env.state.modals.at(-1);
function type(m, name, value) {
  const field = row(m.contentEl, name).querySelector('input, textarea');
  field.value = value;
  field.dispatch('input');
}

/** Opens the dialog, fills it in and presses Import; resolves once a notice says how it went. */
async function importWith(env, things, links = '') {
  await command(env).callback();
  const m = dialog(env);
  assert.ok(m, `the dialog is open, not: ${env.state.notices.join(' | ')}`);
  type(m, 'Graph name', 'customers');
  type(m, 'Things query', things);
  if (links) type(m, 'Links query', links);
  const said = env.state.notices.length;
  button(m.contentEl, 'Import').click();
  await until(() => env.state.notices.length > said);
  return { m, notice: env.state.notices.at(-1) };
}

describe('Import offers the SQLite files of the vault, with nothing to set up (settings_db_connections)', () => {
  test('each .sqlite, .sqlite3 or .db file is offered by its path; nothing else is', async () => {
    const env = await open({ files: { 'b.db': new Uint8Array(0), 'notes.md': '# n', 'table.csv': 'a,b' } });
    try {
      await command(env).callback();
      const offered = row(dialog(env).contentEl, 'Database file').querySelectorAll('option');
      assert.deepEqual(
        offered.map((o) => o.textContent),
        ['b.db', DB],
      );
      assert.deepEqual(env.reads, [], 'opening the dialog reads nothing');
    } finally {
      env.uninstall();
    }
  });

  test('with no database file in the vault, Import says so and opens nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
      await command(env).callback();
      assert.equal(env.state.modals.length, 0);
      assert.match(env.state.notices.at(-1), /No database file is in the vault/);
    } finally {
      env.uninstall();
    }
  });

  test('the settings page holds no database connection, password or key', async () => {
    const env = await open();
    try {
      const tab = env.state.settingTabs[0];
      tab.display();
      assert.doesNotMatch(tab.containerEl.textContent, /Database|password/i);
      assert.ok(!('dbConnections' in env.plugin.settings));
    } finally {
      env.uninstall();
    }
  });
});

describe('Import reads the file only when pressed, on the device, and writes text (db_import_on_request)', () => {
  for (const mobile of [false, true])
    test(`on ${mobile ? 'a phone or tablet' : 'desktop'}, Import reads the file once and writes a graph block`, async () => {
      const env = await open({ mobile });
      try {
        const { m, notice } = await importWith(
          env,
          'select id, kind, name, logo from customers',
          'select * from referrals',
        );
        assert.match(notice, /Imported customers from sales into Sales/);
        assert.ok(!env.state.modals.includes(m), 'the dialog closed');
        assert.deepEqual(env.reads, [['select id, kind, name, logo from customers', 'select * from referrals']]);
        const note = env.state.files.get(PATH);
        assert.ok(note.startsWith(NOTE.trimEnd()), 'the note as it was, then the import');
        assert.match(
          note,
          /```gql\n\/\/ graph: customers\n\/\/ Imported from sales on .*: 2 things and 1 link, a copy/,
        );
        assert.match(note, /\(acme:Customer \{name: 'Acme'\}\)/, 'the logo, a blob, is left out');
        assert.match(note, /\(acme\)-\[:REFERRED\]->\(bolt\)/);
        assert.doesNotMatch(note, /select /, 'the queries are not kept, so nothing runs again');
        assert.deepEqual(env.state.files.get(DB), env.bytes, 'the database file is never written');
        assert.deepEqual(env.fetched, [], 'no network was reached');
      } finally {
        env.uninstall();
      }
    });

  test('the block drawn afterwards reads the file no more: it keeps no live link', async () => {
    const env = await open();
    try {
      await importWith(env, 'select id, kind, name from customers');
      const { el } = await show(env, env.state.files.get(PATH));
      await until(() => !!el.querySelector('g.node'));
      assert.equal(env.reads.length, 1, 'drawing the note read nothing');
    } finally {
      env.uninstall();
    }
  });

  test('a query that writes fails, the file and the note left as they were', async () => {
    const env = await open();
    try {
      const { notice } = await importWith(env, 'delete from customers returning id');
      assert.match(notice, /The import from sales failed, so nothing was written: .*readonly/);
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.deepEqual(env.state.files.get(DB), env.bytes);
    } finally {
      env.uninstall();
    }
  });

  test('a query of more than 10,000 rows fails and says how to narrow it', async () => {
    const env = await open();
    try {
      const many =
        'with recursive n(i) as (select 1 union all select i + 1 from n where i < 10001) select i as id from n';
      const { notice } = await importWith(env, many);
      assert.match(notice, /more than 10,000 rows\. Narrow it with where or limit/);
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });

  test('a file that is not a SQLite database fails, and says why', async () => {
    const env = await open({ files: { [DB]: new TextEncoder().encode('not a database at all, only text') } });
    try {
      const { notice } = await importWith(env, 'select * from customers');
      assert.match(notice, /The import from sales failed, so nothing was written: .*not a database/);
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });
});
