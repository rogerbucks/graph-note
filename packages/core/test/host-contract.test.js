// The one host contract (editor spec §41, host_contract_published). A test host built from the published interface
// alone passes every check. A host that breaks a promise fails the check that holds it, saying what was wanted.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { HOST_CONTRACT_VERSION, hostContract, hostServicesContract } from '../src/display/host-contract.ts';
import { memoryStorage } from '../src/index.ts';

/** A host made from the interface alone, with no host behind it: its notices and menus kept where its probe reads them. */
function plainHost(overrides = {}) {
  const doc = new JSDOM('<!doctype html><body></body>').window.document;
  const notices = [];
  let menu = null;
  const host = {
    icon: (el, name) => {
      const mark = doc.createElement('span');
      mark.setAttribute('data-icon', name);
      el.replaceChildren(mark);
    },
    isPhone: () => false,
    notice: (message) => notices.push(message),
    menu: (entries) => (menu = entries),
    ...overrides,
  };
  const probe = {
    doc,
    element: () => doc.body.appendChild(doc.createElement('span')),
    notices: () => notices,
    lastMenu: () =>
      menu?.map((e) =>
        e === 'separator'
          ? e
          : {
              title: e.title,
              ...(e.checked !== undefined && { checked: e.checked }),
              ...(e.warning && { warning: true }),
            },
      ) ?? null,
    choose: (title) => menu.find((e) => e !== 'separator' && e.title === title).onClick(),
  };
  return { host, probe };
}

/**
 * A whole host made from the interface alone. It has the display above, and keeps its settings, secrets and notes in
 * memory. Its links are found among those notes. Its probe also reads the links it opened, and keeps a secret.
 */
function wholeHost(overrides = {}) {
  const { host: display, probe } = plainHost();
  const files = memoryStorage();
  const known = new Set();
  const secrets = new Map();
  const opened = [];
  let saved;
  const host = {
    display,
    links: (path) => ({
      path,
      broken: [],
      found: (target) => known.has(target),
      open: (link) => opened.push(link.opens),
      hover: () => {},
      render: async (markdown, el) => void (el.textContent = markdown),
      cameBack: () => undefined,
      create: async (target) => {
        const done = await files.write(`${target}.md`, '', { expected: null });
        if (done.ok) known.add(target);
        return done.ok;
      },
    }),
    settings: {
      load: async () => saved && JSON.parse(saved),
      save: async (value) => void (saved = JSON.stringify(value)),
    },
    secrets: { get: (name) => secrets.get(name) ?? null },
    files,
    ...overrides,
  };
  return {
    host,
    probe: { ...probe, opened: () => opened, keepSecret: (name, secret) => secrets.set(name, secret) },
  };
}

/** Runs every check on hosts from `make`; the names of those that failed, with their messages. */
async function failures(make, contract = hostContract) {
  const failed = [];
  for (const check of contract(make))
    try {
      await check.run();
    } catch (e) {
      failed.push(`${check.name}: ${e.message}`);
    }
  return failed;
}

describe('the host contract', () => {
  test('a test host built from the published interface alone passes every check', async () => {
    assert.deepEqual(await failures(() => plainHost()), []);
  });

  test('it is versioned, and holds a host to each of its promises by name', () => {
    assert.equal(HOST_CONTRACT_VERSION, 4);
    const names = hostContract(() => plainHost()).map((c) => c.name);
    assert.equal(names.length, 8);
    for (const promise of [
      'icon',
      'phone',
      'notice',
      'menu shows',
      'choosing',
      'style policy',
      'language',
      'direction',
    ])
      assert.ok(
        names.some((n) => n.includes(promise)),
        promise,
      );
  });

  for (const [broken, overrides, check] of [
    ['an icon drawn twice over', { icon: (el) => el.append(el.ownerDocument.createElement('i')) }, 'an icon'],
    ['a phone test that answers a string', { isPhone: () => 'no' }, 'the phone test'],
    ['a notice that shows only its first word', {}, 'a notice'],
    ['a menu that drops its separator', {}, 'a menu shows'],
    ['a style policy said as a word', { noInlineStyle: 'yes' }, 'the style policy'],
    ['a language that is no tag', { language: () => 'not a language!' }, 'the language'],
    ['a direction said as a side', { direction: () => 'right' }, 'the direction'],
  ])
    test(`${broken} fails the check that holds it, saying what was wanted`, async () => {
      const make = () => {
        const made = plainHost(overrides);
        if (broken.startsWith('a notice')) {
          const notice = made.host.notice;
          made.host.notice = (m) => notice(m.split(' ')[0]);
        }
        if (broken.startsWith('a menu')) {
          const menu = made.host.menu;
          made.host.menu = (entries, ...rest) =>
            menu(
              entries.filter((e) => e !== 'separator'),
              ...rest,
            );
        }
        return made;
      };
      const failed = await failures(make);
      assert.equal(failed.length, 1, failed.join('\n'));
      assert.ok(failed[0].startsWith(check), failed[0]);
      assert.match(failed[0], /wanted .+, got /);
    });

  test('a menu whose rows all run every action fails the choosing check', async () => {
    const failed = await failures(() => {
      const made = plainHost();
      let shown = [];
      const menu = made.host.menu;
      made.host.menu = (entries, ...rest) => ((shown = entries), menu(entries, ...rest));
      made.probe.choose = () => shown.forEach((e) => e !== 'separator' && e.onClick());
      return made;
    });
    assert.equal(failed.length, 1, failed.join('\n'));
    assert.ok(failed[0].startsWith('choosing a menu row'), failed[0]);
  });

  test('a whole host built from the published interface alone passes every check: display, links, settings, secrets, notes', async () => {
    assert.deepEqual(await failures(() => wholeHost(), hostServicesContract), []);
    const names = hostServicesContract(() => wholeHost()).map((c) => c.name);
    for (const part of ['icon', 'settings', 'secret', 'links', 'opening a link', 'notes: '])
      assert.ok(
        names.some((n) => n.includes(part)),
        part,
      );
  });

  for (const [broken, overrides, check] of [
    [
      'settings that forget what was saved',
      { settings: { load: async () => undefined, save: async () => {} } },
      'settings',
    ],
    ['secrets that answer an empty text for a name held nowhere', { secrets: { get: () => '' } }, 'a secret'],
    [
      'links that open nothing',
      { links: (path) => ({ ...wholeHost().host.links(path), open: () => {} }) },
      'opening a link',
    ],
  ])
    test(`a whole host with ${broken} fails the check that holds it`, async () => {
      const failed = await failures(() => {
        const made = wholeHost();
        Object.assign(made.host, overrides);
        return made;
      }, hostServicesContract);
      assert.equal(failed.length, 1, failed.join('\n'));
      assert.ok(failed[0].startsWith(check), failed[0]);
    });

  test('a whole host whose notes break the storage contract fails the notes’ checks', async () => {
    const failed = await failures(() => {
      const made = wholeHost();
      const files = made.host.files;
      made.host.files = { ...files, list: async () => ['always.md'] };
      return made;
    }, hostServicesContract);
    assert.ok(failed.length > 0);
    assert.ok(
      failed.every((f) => f.startsWith('notes: ')),
      failed.join('\n'),
    );
  });
});
