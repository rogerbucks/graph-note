// Every function by keyboard on any device that has or can have one (editor spec §11, keyboard_any_device), on the
// browser editor's page, half 1 of 2: the keyboard-only run of the page's states in a phone's width, where the page takes
// its phone layout (the edit pane in tabs, the details as a bottom sheet), a keyboard attached. A tablet is as wide as
// the page's desktop layout, which test/a11y-keyboard-page-*.test.js run; the Obsidian host's phone and tablet layouts
// are run in test/a11y-keyboard-devices.test.js.
import { keyboardPageTests } from './repository/keyboard-page.js';

keyboardPageTests(1, true);
