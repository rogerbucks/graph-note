// Every function by keyboard on any device that has or can have one (editor spec §11, keyboard_any_device). This is
// the keyboard-only run of test/a11y-keyboard.test.js, over every view of the Obsidian host. It runs on a phone and on
// a tablet with a keyboard attached. There the layout differs: tabs and a bottom sheet in the pane, a sheet for the
// details. Every action is reached and operated, and every focus is left.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, onDevice } from '../packages/obsidian/test/host/load-plugin.js';
import { toHtml } from './repository/wcag.js';
import { OBSIDIAN } from './repository/views-obsidian.js';
import { runProblems } from './repository/keyboard-run.js';

const DEVICES = { 'a phone': { mobile: true, width: 390 }, 'a tablet': { mobile: true, width: 820 } };

before(() => build());

for (const [device, on] of Object.entries(DEVICES))
  describe(`the Obsidian host on ${device} with a keyboard: every view, from the keyboard alone`, () => {
    before(() => onDevice(on));
    after(() => onDevice(undefined));
    for (const [name, open] of Object.entries(OBSIDIAN))
      test(`${name}: every action reached and operated, and every focus left`, async () => {
        const problems = await runProblems(
          open,
          ({ env }) => env.doc,
          ({ env }) => toHtml(env.doc.body),
          ({ env }) => env.uninstall(),
        );
        assert.deepEqual(problems, []);
      });
  });
