// Reads the device checklist and the notes in the test vault that show each of its items, for
// test/device-check-notes.test.js. Test code only — nothing here ships in the plugin.
import { read, walk } from './repo.js';

export const CHECKLIST = 'packages/obsidian/test/device-checklist.md';
export const FOLDER = 'test-vault/Device checks';
export const INDEX = `${FOLDER}/Device checks.md`;
/** Where the notes link back to: the checklist on GitHub, found there by the item's number. */
export const CHECKLIST_URL =
  'https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md';
/** The labels a note has, in the order Roger reads them: the number is its title, then the result, the diagram, the rest. */
export const LABELS = ['You should see', 'Test diagram', 'Do this', 'Checklist line', 'Back to the checklist'];
const NUMBER = /^\*\*([A-Z]-\d\d)\*\*/;

/**
 * What a device pass adds to an item, from a device's name and its tick to the end of the item ("Mac ✓ 0.3.0, 9 Oct 2026
 * ..."): left out when an item is compared, so ticking one off on a device never breaks its note. An item that ran on to
 * its mark with a colon ("each card standing out: Mac ✓ …") ends on a full stop instead, so it ends cleanly.
 */
export const withoutMarks = (text) =>
  text
    .replace(/\s*\b(Mac|iPhone|Android)\s✓.*$/s, '')
    .trim()
    .replace(/[:;,]$/, '.');

/**
 * The ids of the requirements an item names in a bracket at its end ("(slice 2, park_for_later, deferred_drawn)"): left
 * out when an item is compared, because a note stands on its own and its reader has no use for them.
 */
export const withoutIds = (text) =>
  text.replace(/\s*\((?:slice \d+|(?:slice \d+, )?[a-z]+(?:_[a-z]+)+(?:, [a-z]+(?:_[a-z]+)+)*)\)/g, '');

/** The words that quote a text a note's reader will see in Obsidian, each computed by the test with the real function. */
export const QUOTED = ['readback', 'label', 'tap', 'detail', 'footer', 'export-file', 'notice'];

/** Whitespace as one space, so a line wrapped in the checklist and one long line in a note are the same words. */
export const words = (text) => text.replace(/\s+/g, ' ').trim();

/** A line of the checklist as a note quotes it: a < is written \< there, so Obsidian does not take <title> for HTML. */
export const unescaped = (text) => text.replace(/\\</g, '<');

/**
 * The checklist's sections, each with its heading and its items. An item is `{ number, checked, text, line }`: its
 * number ('' when it has none), its tick, its words with the wrapped lines joined (and no tick), and its 1-based line.
 */
export function checklistSections(text = read(CHECKLIST)) {
  const sections = [];
  let item = null;
  text.split('\n').forEach((line, i) => {
    const heading = /^## (.+)$/.exec(line);
    const start = /^- \[( |x)\] (.*)$/.exec(line);
    if (heading) {
      sections.push({ heading: heading[1], items: [] });
      item = null;
    } else if (start && sections.length) {
      item = { number: NUMBER.exec(start[2])?.[1] ?? '', checked: start[1] === 'x', text: start[2], line: i + 1 };
      sections.at(-1).items.push(item);
    } else if (item && /^ {6}\S/.test(line)) item.text += ` ${line.trim()}`;
    else item = null;
  });
  return sections.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it, text: words(it.text) })) }));
}

/** The sections that have notes: every section with items except Before, which is setup. In checklist order. */
export const noted = (sections) => sections.filter((s) => s.items.length && s.heading !== 'Before');

/** The name of a section's folder: its place among the sections that have notes, then its heading without the spec reference. */
export const folderName = (sections, section) =>
  `${String(noted(sections).indexOf(section) + 1).padStart(2, '0')} ${section.heading.split(' — ')[0]}`;

/** Every note under Device checks, as repo paths, in the order a file listing sorts them; not the index. */
export const noteFiles = () =>
  walk(FOLDER)
    .filter((f) => f.endsWith('.md') && f !== INDEX)
    .sort();

/** The text of a note between the line that starts one label and the line that starts the next, labels in LABELS' form. */
export function partsOf(note) {
  const lines = note.split('\n');
  const at = LABELS.map((label) => lines.findIndex((l) => l.startsWith(`**${label}:**`)));
  const part = (i) => lines.slice(at[i], at[i + 1] ?? lines.length).join('\n');
  return { lines, at, part };
}

/** The expectations a note makes of its graph blocks, from its `<!-- expect: … -->` lines. */
export const expectations = (note) =>
  [...note.matchAll(/^<!-- expect: (.+?) -->$/gm)].map(([, raw]) => {
    const quoted = /^([\w-]+) "(.*)"$/.exec(raw);
    const counted = /^([\w-]+) (\d+)$/.exec(raw);
    if (quoted) return { word: quoted[1], text: quoted[2], raw };
    if (counted) return { word: counted[1], count: Number(counted[2]), raw };
    return { word: raw, raw };
  });
