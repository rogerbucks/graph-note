// The rename from Graph Note to Thoughtknot: the product's names change, the repository's address, the GitHub
// Project's title and the kind of note keep theirs, and running it again changes nothing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renameText, renamePath } from '../scripts/rename-to-thoughtknot.mjs';

describe('the rename to Thoughtknot', () => {
  test('renames every form of the product name', () => {
    assert.equal(
      renameText(
        'Graph Note · GraphNotePlugin · @graph-note/core · .graph-note-svg · GRAPH_NOTE_TEST · graphNoteWorker',
      ),
      'Thoughtknot · ThoughtknotPlugin · @thoughtknot/core · .thoughtknot-svg · THOUGHTKNOT_TEST · thoughtknotWorker',
    );
  });

  test('keeps the repository, its site, the Project title and the kind of note', () => {
    const kept = [
      'https://github.com/rogerbucks/graph-note/wiki/Roadmap',
      'https://rogerbucks.github.io/graph-note/',
      "'graph-note requirements'",
      'a graph note holds graph notes',
      'RogerBucks/Graph-Note',
      String.raw`/github\.com[:/][^/]+\/graph-note(\.git)?$/`,
    ];
    for (const text of kept) assert.equal(renameText(text), text);
  });

  test('renames paths, and a second run changes nothing', () => {
    assert.equal(renamePath('wiki/How-to-use-Graph-Note.md'), 'wiki/How-to-use-Thoughtknot.md');
    const once = renameText('Graph Note at https://github.com/rogerbucks/graph-note');
    assert.equal(renameText(once), once);
  });
});
