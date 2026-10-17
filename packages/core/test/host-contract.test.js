// The one host contract (editor spec §41, host_contract_published): a test host built from the published interface alone
// passes every check, and a host that breaks a promise fails the check that holds it, saying what was wanted.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { HOST_CONTRACT_VERSION, hostContract } from '../src/display/host-contract.ts';

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

/** Runs every check on hosts from `make`; the names of those that failed, with their messages. */
async function failures(make) {
  const failed = [];
  for (const check of hostContract(make))
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
    assert.equal(HOST_CONTRACT_VERSION, 1);
    const names = hostContract(() => plainHost()).map((c) => c.name);
    assert.equal(names.length, 6);
    for (const promise of ['icon', 'phone', 'notice', 'menu shows', 'choosing', 'style policy'])
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
});
