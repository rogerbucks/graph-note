// The rename from Graph Note to ThoughtKnot. The product's names change. The repository's address, the GitHub
// Project's title and the kind of note keep theirs. Running it again changes nothing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renameText, renamePath } from '../scripts/rename-to-thoughtknot.mjs';

describe('the rename to ThoughtKnot', () => {
  test('renames every form of the product name', () => {
    assert.equal(
      renameText(
        'Graph Note · GraphNotePlugin · @graph-note/core · .graph-note-svg · GRAPH_NOTE_TEST · graphNoteWorker',
      ),
      'ThoughtKnot · ThoughtKnotPlugin · @thoughtknot/core · .thoughtknot-svg · THOUGHTKNOT_TEST · thoughtknotWorker',
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

  test('spells the name with a capital K, and keeps ids lower case', () => {
    assert.equal(renameText('Thoughtknot · thoughtknot'), 'ThoughtKnot · thoughtknot');
  });

  test('renames paths, and a second run changes nothing', () => {
    assert.equal(renamePath('wiki/How-to-use-Graph-Note.md'), 'wiki/How-to-use-ThoughtKnot.md');
    const once = renameText('Graph Note at https://github.com/rogerbucks/graph-note');
    assert.equal(renameText(once), once);
  });
});
