// The companion note of an export saved into the vault (editor spec §16, export_companion_note): a short Markdown note that
// links the image, names the note it came from, the graph or view, the day and the scope, and holds nothing of the data
// beyond what the image shows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { companionNote } from '../src/export-note.ts';
import { exportScope } from '../src/export-scope.ts';
import { readNote } from '../src/drawing.ts';

const TEAM = `// graph: team · SOURCE
(alice:Person {name: 'Alice', salary: 'SECRETFIGURE'}),
(bob:Person {name: 'Bob'}),
(core:Team {name: 'Core'}),
(alice)-[:KNOWS]->(bob),
(bob)-[:MEMBER_OF]->(core)`;
const reading = readNote([TEAM]);
const VIEW = { name: 'around_bob', spec: { kind: 'near', id: 'bob', depth: 1 } };
const note = (scope, over = {}) =>
  companionNote({ image: 'Team-team-2026-10-11.svg', note: 'Trips/Team.md', date: '2026-10-11', scope, ...over });

describe('the companion note', () => {
  // proves: export_companion_note
  test('links the image and the note it came from, names the graph, the day and the scope', () => {
    const text = note(exportScope(reading, { graph: 'team' }));
    assert.match(text, /^# Export of team\n/);
    assert.match(text, /^!\[\[Team-team-2026-10-11\.svg\]\]$/m);
    assert.match(text, /^- From: \[\[Trips\/Team\]\]$/m);
    assert.match(text, /^- Graph: team$/m);
    assert.match(text, /^- Scope: the whole diagram$/m);
    assert.match(text, /^- Exported: 11 Oct 2026$/m);
    assert.ok(text.endsWith('\n'));
  });

  // proves: export_companion_note
  test('names the view and says it in words, and whether the rest of the graph is faded in', () => {
    const view = note(exportScope(reading, { graph: 'team', view: VIEW }));
    assert.match(view, /^# Export of team, view around_bob\n/);
    assert.match(view, /^- View: around_bob, everything within 1 step of Bob$/m);
    assert.match(view, /^- Scope: only the view$/m);
    const faded = note(exportScope(reading, { graph: 'team', view: VIEW, context: true }));
    assert.match(faded, /^- Scope: the view, with the rest of the graph faded$/m);
  });

  // proves: export_companion_note
  test('holds nothing of the data beyond what the image shows: only the names the image carries', () => {
    const text = note(exportScope(reading, { graph: 'team', view: VIEW }));
    assert.doesNotMatch(text, /SECRETFIGURE|salary/);
    assert.doesNotMatch(text, /Alice|Carol|Core/);
    assert.ok(text.split('\n').length <= 12);
  });

  // proves: export_companion_note
  test('links the note without its .md, and a PNG as it links an SVG', () => {
    const text = note(exportScope(reading, { graph: 'team' }), { image: 'Team-team-2026-10-11.png', note: 'Team.md' });
    assert.match(text, /^!\[\[Team-team-2026-10-11\.png\]\]$/m);
    assert.match(text, /^- From: \[\[Team\]\]$/m);
  });

  // proves: export_companion_note, big_export
  test('of an image split across pages, shows every page in order and says how many there are', () => {
    const pages = ['T-page-1-of-3.png', 'T-page-2-of-3.png', 'T-page-3-of-3.png'];
    const text = note(exportScope(reading, { graph: 'team' }), { image: pages[0], pages });
    assert.deepEqual(
      [...text.matchAll(/^!\[\[(.+)\]\]$/gm)].map((m) => m[1]),
      pages,
    );
    assert.match(text, /^- Pages: 3, in reading order: along each row, then down$/m);
  });

  // proves: export_companion_note
  test('cannot be broken out of its links by a name with link marks in it', () => {
    const text = note(exportScope(reading, { graph: 'team' }), { image: 'a]]b|c.svg', note: 'x]]![[y.md' });
    assert.doesNotMatch(text, /\]\]b|\]\]!\[\[/);
    assert.equal((text.match(/\[\[/g) ?? []).length, 2);
    assert.equal((text.match(/\]\]/g) ?? []).length, 2);
  });
});
