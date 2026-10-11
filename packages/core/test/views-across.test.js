// A view saved as shown (editor spec §7, view_saved_as_shown): when the user asks, a view's zoom, position, the area it
// framed and what was selected are written in the style graph, never in the data; read back, they show the view as it
// was. (The other parts of test_views_across, views drawn across notes, are slice 3.)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { gqlBlocks } from '../src/blocks.ts';
import { readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';
import { Zoom } from '../src/zoom.ts';

const fence = (b) => '```gql\n' + b + '\n```';
const DATA = "// graph: trip\n(home:Place {name: 'Home'}),\n(park:Place {name: 'Park'}),\n(home)-[:NEAR]->(park)";
const VIEW = "// graph: trip · QUERY view both\nMATCH (n) WHERE n.id IN ['home', 'park'] RETURN n";
const NOTE = `# Trip\n\n${fence(DATA)}\n\n${fence(VIEW)}\n`;
const texts = (note) => gqlBlocks(note).map((b) => b.text);
const styleOfNote = (note) => readStyle(texts(note), 'trip', readNote(texts(note))).style;

describe('a view saved as shown', () => {
  test('is written in the style graph, and the data is left exactly as it was', () => {
    const r = styleEdit(NOTE, 'trip', { shown: { view: 'both', zoom: 1.5, x: 120, y: -40, selected: 'park' } });
    assert.ok('note' in r, r.refused);
    const after = texts(r.note);
    assert.ok(after.includes(DATA), 'the data block is untouched');
    assert.ok(after.includes(VIEW), 'the view block is untouched');
    assert.equal(
      after.filter((t) => /^\/\/ graph: trip_style · STYLE trip/.test(t)).length,
      1,
      'a style block of its own',
    );
    assert.deepEqual(readNote(texts(r.note)).world.trip.edges, readNote(texts(NOTE)).world.trip.edges);
  });

  test('reopens the same: its zoom and position given back to the drawing, and what was selected', () => {
    const zoom = new Zoom({ width: 400, height: 300 }, { width: 600, height: 400 }, 'pane');
    zoom.zoomAt(1.6, 100, 50);
    zoom.panBy(-30, 20);
    const was = zoom.view();
    const r = styleEdit(NOTE, 'trip', {
      shown: { view: 'both', zoom: was.scale, x: was.x, y: was.y, selected: 'park' },
    });
    const shown = styleOfNote(r.note).shown.get('both');
    assert.equal(shown.selected, 'park');
    const again = new Zoom({ width: 400, height: 300 }, { width: 600, height: 400 }, 'pane');
    again.restore(shown.zoom, shown.x, shown.y);
    assert.deepEqual(again.view(), was);
  });

  test('saved again, replaces what was saved before rather than adding to it', () => {
    let note = styleEdit(NOTE, 'trip', { shown: { view: 'both', zoom: 1, x: 0, y: 0 } }).note;
    note = styleEdit(note, 'trip', { shown: { view: 'both', zoom: 2, x: 5, y: 5 } }).note;
    assert.equal(styleOfNote(note).shown.get('both').zoom, 2);
    assert.equal((note.match(/:Shown/g) ?? []).length, 1);
  });
});
