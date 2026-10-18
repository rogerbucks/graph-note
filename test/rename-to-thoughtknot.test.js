// The rename from Graph Note to ThoughtKnot: the product's names, the repository's address and the GitHub Project's
// title change, the kind of note keeps its name, and running it again changes nothing.
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

  test('renames the repository, its site and the Project title, and keeps the kind of note', () => {
    assert.equal(
      renameText('https://github.com/rogerbucks/graph-note/wiki · https://rogerbucks.github.io/graph-note/'),
      'https://github.com/rogerbucks/thoughtknot/wiki · https://rogerbucks.github.io/thoughtknot/',
    );
    assert.equal(renameText(String.raw`rogerbucks\/graph-note`), String.raw`rogerbucks\/thoughtknot`);
    assert.equal(renameText("'graph-note requirements'"), "'thoughtknot requirements'");
    assert.equal(renameText('a graph note holds graph notes'), 'a graph note holds graph notes');
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
