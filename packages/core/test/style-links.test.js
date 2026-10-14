// How the style graph draws links (editor spec §25): their routing, straight, curved or right-angled, so a dense graph
// can trade curves for fewer crossings (untangle_routing), and whether links running between the same two groups are
// merged into shared trunks (untangle_merge), each for the whole graph or a view; and the View menu's switches a view
// saved as shown keeps (view_switch_view_only). Checked as every style thing is: a word not allowed is a problem with the
// nearest as its fix, and two choices for one place are a problem on the later, which is left out.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { linksOf, readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';

const TRIP = `// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;

/** The style of graph trip from a style block holding these lines, and its problems. */
const styled = (...lines) => {
  const texts = [TRIP, ['// graph: trip_style · STYLE trip', ...lines].join('\n')];
  return readStyle(texts, 'trip', readNote(texts));
};
const said = (problems) => problems.map((p) => [p.line, p.message, p.fix]);

describe('a Links in the style graph', () => {
  test('routes the links straight, curved or right-angled, and merges them, for the whole graph or a view', () => {
    const { style, problems } = styled(
      "(r1:Links {routing: 'straight'}),",
      "(r2:Links {view: 'near', routing: 'right-angled', merge: 'on'}),",
      "(r3:Links {merge: 'off'})",
    );
    assert.deepEqual(problems, []);
    assert.deepEqual(
      style.links.map(({ at, ...l }) => [at.line, l]),
      [
        [2, { routing: 'straight' }],
        [3, { view: 'near', routing: 'right-angled', merge: 'on' }],
        [4, { merge: 'off' }],
      ],
    );
  });

  test('a routing that is not one of the three is a problem, fixed to the nearest, and is left out', () => {
    const { style, problems } = styled("(r1:Links {routing: 'stright'})");
    assert.deepEqual(said(problems), [
      [2, 'stright is not a routing: links are curved, straight or right-angled', 'change stright to straight'],
    ]);
    assert.deepEqual(problems[0].replace, { written: 'stright', with: ['straight'] });
    assert.deepEqual(style.links, []);
  });

  test('merge is on or off, and a Links that sets neither routing nor merge says what it needs', () => {
    const { style, problems } = styled("(r1:Links {merge: 'yes'}),", "(r2:Links {view: 'near'})");
    assert.deepEqual(said(problems), [
      [2, 'merge must be on or off', 'change yes to on or off'],
      [3, 'a Links sets routing or merge', "add routing: 'curved', 'straight' or 'right-angled', or merge: 'on'"],
    ]);
    assert.deepEqual(style.links, []);
  });

  test('two routings, or two merges, for one place are a problem on the later, which is left out', () => {
    const { style, problems } = styled(
      "(r1:Links {routing: 'straight'}),",
      "(r2:Links {merge: 'on'}),",
      "(r3:Links {routing: 'curved'}),",
      "(r4:Links {view: 'near', merge: 'on'}),",
      "(r5:Links {view: 'near', merge: 'off', routing: 'straight'}),",
      "(r6:Links {routing: 'straight'})",
    );
    assert.deepEqual(said(problems), [
      [4, 'the routing of links in the whole graph is set to both straight (line 2) and curved', 'remove one of them'],
      [6, 'merging links in view near is set to both on (line 5) and off', 'remove one of them'],
    ]);
    assert.deepEqual(
      style.links.map((l) => l.at.id),
      ['r1', 'r2', 'r4', 'r6'],
    );
  });

  test('a key a Links does not know is fixed to the nearest it does', () => {
    const { problems } = styled("(r1:Links {routng: 'straight'})");
    assert.deepEqual(said(problems), [[2, 'routng is not a key a Links uses', 'change routng to routing']]);
  });
});

describe('the links of a graph or a view', () => {
  test('are curved and unmerged unless the style graph says otherwise', () => {
    assert.deepEqual(linksOf(styled().style), { routing: 'curved', merge: false });
  });

  test('a view takes its own routing and merging over the whole graph’s, each apart', () => {
    const { style } = styled(
      "(r1:Links {routing: 'straight', merge: 'on'}),",
      "(r2:Links {view: 'near', routing: 'right-angled'})",
    );
    assert.deepEqual(linksOf(style), { routing: 'straight', merge: true });
    assert.deepEqual(linksOf(style, 'near'), { routing: 'right-angled', merge: true });
    assert.deepEqual(linksOf(style, 'far'), { routing: 'straight', merge: true });
  });
});

describe('a view saved as shown keeps its switches', () => {
  test('labels, hubs, groups and merge, each on or off, are read back with how it was shown', () => {
    const { style, problems } = styled(
      "(w1:Shown {view: 'near', zoom: 1, labels: 'off', hubs: 'on', groups: 'on', merge: 'off'}),",
      "(w2:Shown {view: 'far', hubs: 'maybe'})",
    );
    assert.deepEqual(said(problems), [[3, 'hubs must be on or off', 'change maybe to on or off']]);
    assert.deepEqual(style.shown.get('near'), { zoom: 1, labels: 'off', hubs: 'on', groups: 'on', merge: 'off' });
    assert.deepEqual(style.shown.get('far'), {});
  });

  test('Save as shown writes them, and refuses a switch that is not on or off', () => {
    const note = ['# Trip', '', '```gql', TRIP, '```', ''].join('\n');
    const switches = { labels: 'off', hubs: 'on', groups: 'off', merge: 'on' };
    const r = styleEdit(note, 'trip', { shown: { view: 'near', zoom: 1, x: 0, y: 0, switches } });
    assert.ok('note' in r, JSON.stringify(r));
    assert.match(
      r.note,
      /\(shown_1:Shown \{view: 'near', zoom: 1, x: 0, y: 0, labels: 'off', hubs: 'on', groups: 'off', merge: 'on'\}\)/,
    );
    const bad = styleEdit(note, 'trip', { shown: { view: 'near', zoom: 1, x: 0, y: 0, switches: { hubs: 'yes' } } });
    assert.deepEqual(bad, { refused: 'hubs must be on or off' });
  });
});
