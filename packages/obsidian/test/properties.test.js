// The inspector (spec §14, inspector_native). While a block is edited in place, a box's or a link's details are Obsidian's
// own Properties panel. There is a row for each property, with a field suited to its type. Each change is written as text.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { PATH, READER, NOTE, show } from './host/card-notes.js';

before(() => build());

describe('the inspector, in edit mode', () => {
  // inspector_native (spec §14, 7 Oct 2026): it looks and behaves like Obsidian's own Properties panel. One row for each
  // property, with its name and a field suited to its type. Adding and removing happen in place. It uses the theme's
  // spacing, type and colours. It is built on Obsidian's own markup and classes, so it takes the theme for free.
  const PRICED = READER.replace(
    "(large:Option {name: 'Large reader'})",
    "(large:Option {name: 'Large reader', price: 300, ordered: DATE '2026-10-01', checked: TRUE})",
  );
  const NOTE2 = NOTE.replace(READER, PRICED);
  const READER_LAST = '(large)-[:ANSWERS]->(q)';
  const field = (el, label) => el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === label);
  const row = (el, key) => el.querySelector(`.metadata-property[data-property-key="${key}"]`);
  const text = (el) => el.querySelector('textarea').value;
  /** Sets a field as a person would, and lets it go: the change is written when the field is left. */
  const enter = (input, value) => {
    if (input.getAttribute('type') === 'checkbox') input.checked = value;
    else input.value = value;
    input.dispatch('change');
  };
  /** Opens a property's type menu, from its icon, and picks an item. */
  const pick = (env, el, key, title) => {
    const icon = row(el, key).querySelector('.metadata-property-icon');
    icon.click();
    const menu = env.state.menus.at(-1);
    const item = menu.items.find((it) => it.title === title);
    assert.ok(item, `${title} in ${menu.items.map((it) => it.title)}`);
    item.click();
  };

  async function editing(env) {
    const el = await show(env);
    labelled(el, 'Edit here').click();
    await until(() => !!el.querySelector('textarea'));
    return el;
  }
  const tap = (el, which) => el.querySelectorAll('g.node')[which].dispatch('keydown', { key: 'Enter' });

  test('outside edit mode, a box’s details are for reading only', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await show(env);
      tap(el, 1);
      assert.equal(el.querySelector('.thoughtknot-details input'), null);
    } finally {
      env.uninstall();
    }
  });

  test('it is built as Obsidian’s Properties panel: one row for each property, its name, and a field suited to its type', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.thoughtknot-details');
      const box = panel.querySelector('.metadata-container');
      assert.ok(box.querySelector('.metadata-properties-heading .metadata-properties-title'));
      const rows = box.querySelectorAll('.metadata-properties .metadata-property');
      assert.deepEqual(
        rows.map((r) => r.getAttribute('data-property-key')),
        ['checked', 'name', 'ordered', 'price'],
      );
      for (const r of rows) {
        assert.ok(r.querySelector('.metadata-property-key .metadata-property-icon'));
        assert.ok(r.querySelector('.metadata-property-key input.metadata-property-key-input'));
        assert.ok(r.querySelector('.metadata-property-value'));
      }
      assert.equal(field(panel, 'Value of price').getAttribute('type'), 'number');
      assert.equal(field(panel, 'Value of price').value, '300');
      assert.equal(field(panel, 'Value of name').getAttribute('type'), 'text');
      assert.equal(field(panel, 'Value of ordered').getAttribute('type'), 'date', 'a date picker for a date');
      assert.equal(field(panel, 'Value of ordered').value, '2026-10-01');
      assert.equal(field(panel, 'Value of checked').getAttribute('type'), 'checkbox', 'a switch for true or false');
      assert.equal(field(panel, 'Value of checked').checked, true);
      assert.equal(row(panel, 'price').getAttribute('data-property-type'), 'number');
      assert.ok(box.querySelector('.metadata-add-button'), 'adding is in place, as Obsidian adds');
      assert.equal(
        panel.querySelectorAll('button').filter((b) => /^Save/.test(b.getAttribute('aria-label') ?? '')).length,
        0,
        'no Save buttons',
      );
    } finally {
      env.uninstall();
    }
  });

  test('a value is written when the field is left, checked against its type first', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.thoughtknot-details');
      enter(field(panel, 'Value of price'), 'three hundred');
      assert.match(panel.querySelector('[role="alert"]').textContent, /a number/);
      assert.equal(text(el), PRICED, 'nothing written');
      enter(field(el.querySelector('.thoughtknot-details'), 'Value of price'), '320');
      assert.equal(text(el), PRICED.replace('price: 300', 'price: 320'));
      await until(() => env.state.files.get(PATH).includes('price: 320'), 2000);
    } finally {
      env.uninstall();
    }
  });

  test('the switch writes true or false, and the date picker a date', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      enter(field(el.querySelector('.thoughtknot-details'), 'Value of checked'), false);
      assert.match(text(el), /checked: FALSE/);
      enter(field(el.querySelector('.thoughtknot-details'), 'Value of ordered'), '2026-11-05');
      assert.match(text(el), /ordered: DATE '2026-11-05'/);
    } finally {
      env.uninstall();
    }
  });

  test('a property is added in place: a new row, its name offered from those used on things of its kind', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.thoughtknot-details');
      panel.querySelector('.metadata-add-button').click();
      const name = field(panel, 'New property name');
      assert.equal(env.doc.activeElement, name, 'the new row’s name has the focus');
      const list = panel.querySelector(`datalist#${name.getAttribute('list')}`);
      assert.deepEqual(
        list.querySelectorAll('option').map((o) => o.getAttribute('value')),
        ['checked', 'name', 'ordered', 'price', 'title'],
      );
      enter(name, 'colour');
      assert.equal(text(el), PRICED, 'a name alone writes nothing');
      enter(field(panel, 'Value of new property'), 'grey');
      assert.match(text(el), /checked: TRUE, colour: 'grey'\}/);
    } finally {
      env.uninstall();
    }
  });

  test('the icon’s menu changes a property’s type, or removes it, as in Obsidian', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      row(el.querySelector('.thoughtknot-details'), 'price').querySelector('.metadata-property-icon').click();
      const menu = env.state.menus.at(-1);
      assert.deepEqual(
        menu.items.map((it) => it.title),
        ['Text', 'List', 'Number', 'Checkbox', 'Date', 'Date & time', 'Remove'],
      );
      assert.equal(menu.items.find((it) => it.checked)?.title, 'Number');
      pick(env, el.querySelector('.thoughtknot-details'), 'price', 'Text');
      assert.match(text(el), /price: '300'/);
      pick(env, el.querySelector('.thoughtknot-details'), 'name', 'Remove');
      assert.doesNotMatch(text(el), /name: 'Large reader'/);
    } finally {
      env.uninstall();
    }
  });

  test('a type its value does not fit is refused, saying why, and nothing is written', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      pick(env, el.querySelector('.thoughtknot-details'), 'name', 'Number');
      assert.match(el.querySelector('.thoughtknot-details [role="alert"]').textContent, /name: expected a number/);
      assert.equal(text(el), PRICED);
    } finally {
      env.uninstall();
    }
  });

  test('List is offered, as in Obsidian, and asks for a kind and a relationship rather than refusing', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      pick(env, el.querySelector('.thoughtknot-details'), 'name', 'List');
      assert.ok(field(el.querySelector('.thoughtknot-details'), 'Kind of the linked things'));
      assert.ok(field(el.querySelector('.thoughtknot-details'), 'Relationship from this thing'));
      assert.ok(el.querySelector('.thoughtknot-details [role="alert"]').hidden, 'nothing refused');
      assert.equal(text(el), PRICED, 'and nothing written until they are given');
    } finally {
      env.uninstall();
    }
  });

  test('a property is renamed in place, keeping its value', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      enter(
        row(el.querySelector('.thoughtknot-details'), 'price').querySelector('.metadata-property-key-input'),
        'cost',
      );
      assert.match(text(el), /cost: 300/);
      assert.doesNotMatch(text(el), /price/);
    } finally {
      env.uninstall();
    }
  });

  test('renaming onto a name the thing already has is refused, so no value is lost; a new row too', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.thoughtknot-details');
      enter(row(panel, 'price').querySelector('.metadata-property-key-input'), 'name');
      assert.match(panel.querySelector('[role="alert"]').textContent, /already has a property called name/);
      assert.equal(text(el), PRICED);
      assert.equal(row(panel, 'price').querySelector('.metadata-property-key-input').value, 'price');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'New property name'), 'price');
      enter(field(panel, 'Value of new property'), '1');
      assert.match(panel.querySelector('[role="alert"]').textContent, /already has a property called price/);
      assert.equal(text(el), PRICED);
    } finally {
      env.uninstall();
    }
  });

  test('a renamed value is kept exactly as written', async () => {
    const env = await load({ files: { [PATH]: NOTE2.replace('price: 300', 'price: 1.50') } });
    try {
      const el = await editing(env);
      tap(el, 1);
      enter(
        row(el.querySelector('.thoughtknot-details'), 'price').querySelector('.metadata-property-key-input'),
        'cost',
      );
      assert.match(text(el), /cost: 1\.50/);
    } finally {
      env.uninstall();
    }
  });

  test('a new row’s value typed before its name is written once the name is given', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.thoughtknot-details');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'Value of new property'), 'grey');
      assert.match(panel.querySelector('[role="alert"]').textContent, /name it first/);
      enter(field(panel, 'New property name'), 'colour');
      assert.match(text(el), /colour: 'grey'\}/);
      assert.ok(panel.querySelector('[role="alert"]').hidden, 'the alert goes once the property is written');
    } finally {
      env.uninstall();
    }
  });

  test('once written, a new row is a property like the others: named, and removed from the note', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.thoughtknot-details');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'New property name'), 'colour');
      enter(field(panel, 'Value of new property'), 'grey');
      assert.ok(row(panel, 'colour'), 'the row carries its name');
      assert.ok(field(panel, 'Value of colour'));
      pick(env, panel, 'colour', 'Remove');
      assert.doesNotMatch(text(el), /colour/);
    } finally {
      env.uninstall();
    }
  });

  test('a property set elsewhere is not removed here, and the row stays, saying why', async () => {
    const env = await load({
      files: { [PATH]: NOTE2.replace(READER_LAST, `${READER_LAST}\nSET large.status = 'bought'`) },
    });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.thoughtknot-details');
      pick(env, panel, 'status', 'Remove');
      assert.match(panel.querySelector('[role="alert"]').textContent, /status is not written in its pattern here/);
      assert.ok(row(panel, 'status'));
      assert.match(text(el), /SET large\.status = 'bought'/);
    } finally {
      env.uninstall();
    }
  });

  test('a new date and time takes the offset of the chosen day, not of today', async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'Australia/Sydney';
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.thoughtknot-details');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'New property name'), 'start');
      pick(env, panel, '', 'Date & time');
      enter(field(panel, 'Value of new property'), '2026-07-01T09:00');
      assert.match(text(el), /start: DATETIME '2026-07-01T09:00\+10:00'/);
    } finally {
      env.uninstall();
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  test('a link’s properties are edited the same way', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      el.querySelectorAll('g.edge')[0].dispatch('keydown', { key: 'Enter' });
      const panel = el.querySelector('.thoughtknot-details');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'New property name'), 'weight');
      pick(env, panel, '', 'Number');
      enter(field(panel, 'Value of new property'), '2');
      assert.match(text(el), /\(large\)-\[:ANSWERS \{weight: 2\}\]->\(q\)/);
    } finally {
      env.uninstall();
    }
  });

  test('the inspector stays open on the same box after the card is redrawn, so things can be edited in turn', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      enter(field(el.querySelector('.thoughtknot-details'), 'Value of price'), '310');
      await until(() => env.state.files.get(PATH).includes('price: 310'), 2000);
      const again = await show(env);
      const reopened = again.querySelector('.thoughtknot-details');
      assert.ok(!reopened.hidden);
      assert.equal(field(reopened, 'Value of price').value, '310');
    } finally {
      env.uninstall();
    }
  });

  test('on a phone the inspector opens as a bottom sheet; on a desktop it stays in the card', async () => {
    for (const mobile of [true, false]) {
      const env = await load({ files: { [PATH]: NOTE2 }, mobile });
      try {
        const el = await editing(env);
        tap(el, 1);
        assert.equal(el.querySelector('.thoughtknot-details').classList.contains('is-sheet'), mobile);
      } finally {
        env.uninstall();
      }
    }
  });
});
