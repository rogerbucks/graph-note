// Every function by keyboard on any device that has or can have one (editor spec §11, keyboard_any_device). This file
// covers the browser editor's page, half 2 of 2. It is the keyboard-only run of the page's states in a phone's width,
// with a keyboard attached. There the page takes its phone layout: the edit pane in tabs, details as a bottom sheet.
// A tablet is as wide as the page's desktop layout, which test/a11y-keyboard-page-*.test.js run. The Obsidian host's
// phone and tablet layouts are run in test/a11y-keyboard-devices.test.js.
import { keyboardPageTests } from './repository/keyboard-page.js';

keyboardPageTests(2, true);
