// Untangling a large graph (editor spec §25, slice 3): a thing and its neighbours alone, the legend bringing a kind or a
// relationship type forward or hiding it, the shortest path between two things, finding a thing, walking the links by
// arrow key — and, in every one, only the drawing changes, never the data. Host-free: plain data in, sets of what to
// show out; the Obsidian package's tests put them on a drawing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { draw } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';
import { hitAreas, boundsOf } from '../src/hits.ts';
import { Zoom } from '../src/zoom.ts';
import { propertiesOf } from '../src/inspector.ts';
import { edgesOf } from '../src/focus.ts';
import {
  LegendFilter,
  Untangle,
  emphasis,
  find,
  kindLegend,
  neighbourhood,
  neighbourhoodWords,
  nextAlong,
  pathWords,
  shortestPath,
} from '../src/untangle.ts';

const NOTE = `// graph: reader · SOURCE
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader', price: 99}),
(tablet:Option {name: 'Tablet', price: 249}),
(eyes:Reason {title: 'Easy on the eyes'}),
(island:Reason {title: 'Left on its own'}),
(large)-[:ANSWERS]->(q), (tablet)-[:ANSWERS]->(q),
(eyes)-[:FAVOURS]->(large), (eyes)-[:COUNTS_AGAINST]->(tablet)`;
// the links, in order: 0 large→q, 1 tablet→q, 2 eyes→large, 3 eyes→tablet
const reading = readNote([NOTE]);
const drawing = reading.graphs.get('reader');
const edges = edgesOf(drawing);
const sorted = (set) => [...set].sort();
const kept = (k) => ({ things: sorted(k.things), edges: sorted(k.edges) });
const textOf = (key) => drawing.boxes.find((b) => b.key === key)?.text ?? key;

describe('show only a thing and its neighbours', () => {
  test('within one step: the thing, what it links to either way, and the links among them', () => {
    assert.deepEqual(kept(neighbourhood(edges, 'q', 1)), { things: ['large', 'q', 'tablet'], edges: [0, 1] });
    assert.deepEqual(kept(neighbourhood(edges, 'eyes', 1)), { things: ['eyes', 'large', 'tablet'], edges: [2, 3] });
  });

  test('a link between two neighbours is shown too, as the drawing filtered to them would show it', () => {
    const more = [...edges, { from: 'large', to: 'tablet' }];
    assert.deepEqual(kept(neighbourhood(more, 'q', 1)).edges, [0, 1, 4]);
  });

  test('within two steps it reaches the neighbours’ neighbours', () => {
    assert.deepEqual(kept(neighbourhood(edges, 'q', 2)), {
      things: ['eyes', 'large', 'q', 'tablet'],
      edges: [0, 1, 2, 3],
    });
  });

  test('a thing with no links is shown alone', () => {
    assert.deepEqual(kept(neighbourhood(edges, 'island', 2)), { things: ['island'], edges: [] });
  });

  test('the banner names the filter and the steps', () => {
    assert.equal(
      neighbourhoodWords('Which device?', 1),
      'Showing only Which device? and the things within 1 step of it.',
    );
    assert.equal(
      neighbourhoodWords('Which device?', 2),
      'Showing only Which device? and the things within 2 steps of it.',
    );
  });

  test('the whole graph is a step back: clearing the filter shows everything again', () => {
    const u = new Untangle(drawing);
    u.showOnly('q', 1);
    assert.deepEqual(sorted(u.layers(null).hidden.things), ['eyes', 'island']);
    assert.ok(u.only);
    u.showAll();
    assert.equal(u.only, null);
    assert.deepEqual(kept(u.layers(null).hidden), { things: [], edges: [] });
  });

  test('what is filtered out is hidden, with every link that was drawn to it', () => {
    const u = new Untangle(drawing);
    u.showOnly('q', 1);
    const { hidden } = u.layers(null);
    assert.deepEqual(kept(hidden), { things: ['eyes', 'island'], edges: [2, 3] });
  });
});

describe('the legend', () => {
  test('lists each kind and each relationship type of the drawing, with how many', () => {
    assert.deepEqual(
      kindLegend(drawing).map((i) => [i.id, i.what, i.label, i.count]),
      [
        ['kind:Option', 'kind', 'Option', 2],
        ['kind:Question', 'kind', 'Question', 1],
        ['kind:Reason', 'kind', 'Reason', 2],
        ['type:ANSWERS', 'type', 'answers', 2],
        ['type:COUNTS_AGAINST', 'type', 'counts against', 1],
        ['type:FAVOURS', 'type', 'favours', 1],
      ],
    );
  });

  test('choosing one brings it forward, choosing it again hides it, and once more puts it back', () => {
    const l = new LegendFilter();
    assert.equal(l.state('kind:Option'), 'normal');
    assert.equal(l.choose('kind:Option'), 'forward');
    assert.equal(l.state('kind:Option'), 'forward');
    assert.equal(l.choose('kind:Option'), 'hidden');
    assert.equal(l.choose('kind:Option'), 'normal');
    assert.equal(l.any(), false);
  });

  test('a kind brought forward keeps its things at full strength, and fades the rest; nothing is hidden', () => {
    const l = new LegendFilter();
    l.choose('kind:Option');
    const { forward, hidden } = l.apply(drawing, edges);
    assert.deepEqual(kept(forward), { things: ['large', 'tablet'], edges: [] });
    assert.deepEqual(kept(hidden), { things: [], edges: [] });
  });

  test('a relationship type brought forward keeps its links and the things they join', () => {
    const l = new LegendFilter();
    l.choose('type:ANSWERS');
    assert.deepEqual(kept(l.apply(drawing, edges).forward), { things: ['large', 'q', 'tablet'], edges: [0, 1] });
  });

  test('several brought forward add up', () => {
    const l = new LegendFilter();
    l.choose('kind:Reason');
    l.choose('type:ANSWERS');
    assert.deepEqual(kept(l.apply(drawing, edges).forward), {
      things: ['eyes', 'island', 'large', 'q', 'tablet'],
      edges: [0, 1],
    });
  });

  test('with nothing brought forward there is no forward set, so nothing is faded', () => {
    assert.equal(new LegendFilter().apply(drawing, edges).forward, null);
  });

  test('a kind hidden hides its things and the links to them; a type hidden hides its links only', () => {
    const l = new LegendFilter();
    l.choose('kind:Question');
    l.choose('kind:Question');
    l.choose('type:FAVOURS');
    l.choose('type:FAVOURS');
    const { forward, hidden } = l.apply(drawing, edges);
    assert.equal(forward, null, 'what is hidden is not brought forward');
    assert.deepEqual(kept(hidden), { things: ['q'], edges: [0, 1, 2] });
  });

  test('it can be put back all at once', () => {
    const l = new LegendFilter();
    l.choose('kind:Option');
    l.choose('type:ANSWERS');
    assert.equal(l.any(), true);
    l.reset();
    assert.equal(l.any(), false);
    assert.equal(l.state('kind:Option'), 'normal');
  });
});

describe('the shortest path between two things', () => {
  test('is the fewest links, either way along each, with the first found in the drawing’s order on a tie', () => {
    assert.deepEqual(shortestPath(edges, 'tablet', 'large'), { things: ['tablet', 'q', 'large'], edges: [1, 0] });
    assert.deepEqual(shortestPath(edges, 'q', 'eyes'), { things: ['q', 'large', 'eyes'], edges: [0, 2] });
  });

  test('a thing is at no steps from itself', () => {
    assert.deepEqual(shortestPath(edges, 'q', 'q'), { things: ['q'], edges: [] });
  });

  test('two things with no route between them have none, and it says so', () => {
    assert.equal(shortestPath(edges, 'q', 'island'), null);
    assert.equal(pathWords(textOf, 'q', 'island', null), 'There is no path between Which device? and Left on its own.');
  });

  test('a path is told in words, step by step', () => {
    const found = shortestPath(edges, 'tablet', 'large');
    assert.equal(
      pathWords(textOf, 'tablet', 'large', found),
      'The shortest path from Tablet to Large reader is 2 steps: Tablet, Which device?, Large reader.',
    );
    assert.equal(
      pathWords(textOf, 'q', 'large', shortestPath(edges, 'q', 'large')),
      'The shortest path from Which device? to Large reader is 1 step: Which device?, Large reader.',
    );
  });

  test('it is brought forward: the path’s things and links stay at full strength, over any focus', () => {
    const u = new Untangle(drawing);
    const found = u.route('tablet', 'large');
    assert.deepEqual(found.things, ['tablet', 'q', 'large']);
    const focus = { things: new Set(['eyes']), edges: new Set() };
    assert.deepEqual(kept(u.layers(focus).kept), { things: ['large', 'q', 'tablet'], edges: [0, 1] });
    u.clearRoute();
    assert.equal(u.layers(focus).kept, focus);
  });

  test('with none, nothing is brought forward and the focus is left as it was', () => {
    const u = new Untangle(drawing);
    assert.equal(u.route('q', 'island'), null);
    assert.ok(u.routed, 'the two things are still named, so the words can say there is none');
    assert.equal(u.layers(null).kept, null);
  });
});

describe('finding a thing', () => {
  test('by its name, whatever the case, and by part of it', () => {
    assert.deepEqual(
      find(reading, 'reader', 'TABLET').map((f) => [f.key, f.text, f.kind]),
      [['tablet', 'Tablet', 'Option']],
    );
    assert.deepEqual(
      find(reading, 'reader', 'dev').map((f) => f.key),
      ['q'],
    );
  });

  test('by the id it is written under', () => {
    assert.deepEqual(
      find(reading, 'reader', 'island').map((f) => f.key),
      ['island'],
    );
  });

  test('by a property’s value, saying which', () => {
    const found = find(reading, 'reader', '249');
    assert.deepEqual(
      found.map((f) => [f.key, f.via]),
      [['tablet', 'price: 249']],
    );
  });

  test('names come before properties, and each thing once', () => {
    const found = find(reading, 'reader', 'e');
    assert.equal(new Set(found.map((f) => f.key)).size, found.length);
    const firstProperty = found.findIndex((f) => f.via !== 'name');
    assert.ok(firstProperty === -1 || found.slice(firstProperty).every((f) => f.via !== 'name'));
  });

  test('nothing typed, or nothing like it, finds nothing', () => {
    assert.deepEqual(find(reading, 'reader', ''), []);
    assert.deepEqual(find(reading, 'reader', '   '), []);
    assert.deepEqual(find(reading, 'reader', 'zzzz'), []);
    assert.deepEqual(find(reading, 'nothing', 'tablet'), []);
  });

  test('a long list of matches is cut at a limit that is said', () => {
    const things = Array.from({ length: 60 }, (_, i) => `(t${i}:Thing {name: 'Match ${i}'})`).join(',\n');
    const big = readNote([`// graph: big\n${things}`]);
    assert.equal(find(big, 'big', 'match').length, 20);
  });

  test('choosing one selects it and brings it into view, as the details pane does', async () => {
    const svg = draw(drawing, await loadEngine()).svg;
    const areas = hitAreas(svg);
    const id = `node${drawing.boxes.findIndex((b) => b.key === 'island') + 1}`;
    const box = boundsOf(areas, id);
    assert.ok(
      box && box.width > 0 && box.height > 0 && box.x >= 0 && box.x + box.width <= 1.0001,
      'inside the drawing',
    );
    // zoomed in at the top left, a thing far to the bottom right is out of sight until it is revealed
    const z = new Zoom({ width: 1000, height: 500 }, { width: 600, height: 300 }, 'full');
    z.restore(1.5, 0, 0);
    const shown = (b) => {
      const v = z.view();
      const left = v.x + b.x * v.width,
        top = v.y + b.y * v.height;
      return left >= 0 && top >= 0 && left + b.width * v.width <= 600 && top + b.height * v.height <= 300;
    };
    const far = { x: 0.9, y: 0.85, width: 0.05, height: 0.1 };
    assert.ok(!shown(far), 'out of sight');
    z.reveal(far);
    assert.ok(shown(far), 'in view');
    z.reveal(box);
    assert.ok(shown(box), 'the found thing, too');
  });

  test('a thing already in view is left where it is: nothing moves', () => {
    const z = new Zoom({ width: 1000, height: 500 }, { width: 600, height: 300 }, 'full');
    z.restore(1.5, 0, 0);
    let moved = 0;
    z.onChange = () => moved++;
    z.reveal({ x: 0.01, y: 0.01, width: 0.02, height: 0.04 });
    assert.equal(moved, 0);
  });
});

describe('walking the links by arrow key', () => {
  // a thing in the middle, a neighbour on each side
  const star = [
    { from: 'c', to: 'r' },
    { from: 'c', to: 'l' },
    { from: 'u', to: 'c' },
    { from: 'c', to: 'd' },
  ];
  const places = new Map([
    ['c', { x: 0, y: 0 }],
    ['r', { x: 10, y: 1 }],
    ['l', { x: -10, y: -1 }],
    ['u', { x: 1, y: -10 }],
    ['d', { x: -1, y: 10 }],
  ]);

  test('each arrow goes to the neighbour in that direction, whichever way the link points', () => {
    assert.equal(nextAlong(star, places, 'c', 'ArrowRight'), 'r');
    assert.equal(nextAlong(star, places, 'c', 'ArrowLeft'), 'l');
    assert.equal(nextAlong(star, places, 'c', 'ArrowUp'), 'u');
    assert.equal(nextAlong(star, places, 'c', 'ArrowDown'), 'd');
  });

  test('of several that way, the one most nearly straight on', () => {
    const crowd = [...star, { from: 'c', to: 'r2' }];
    const where = new Map([...places, ['r2', { x: 10, y: 8 }]]);
    assert.equal(nextAlong(crowd, where, 'c', 'ArrowRight'), 'r');
    assert.equal(nextAlong(crowd, where, 'c', 'ArrowDown'), 'd');
  });

  test('every neighbour can be reached by some arrow, so no link is left out', () => {
    const corner = [{ from: 'c', to: 'x' }];
    const where = new Map([
      ['c', { x: 0, y: 0 }],
      ['x', { x: 7, y: 7 }],
    ]);
    const reached = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].map((k) => nextAlong(corner, where, 'c', k));
    assert.ok(reached.includes('x'));
  });

  test('no neighbour that way, or no links at all, stays where it is', () => {
    assert.equal(nextAlong(star, places, 'r', 'ArrowRight'), null);
    assert.equal(nextAlong([], places, 'c', 'ArrowRight'), null);
    assert.equal(nextAlong(star, places, 'c', 'Enter'), null, 'only the arrows walk');
  });

  test('without the places of the things it still walks: right and down go on through the links, left and up back', () => {
    assert.equal(nextAlong(star, new Map(), 'c', 'ArrowRight'), 'r');
    assert.equal(nextAlong(star, new Map(), 'c', 'ArrowDown'), 'r');
    assert.equal(nextAlong(star, new Map(), 'c', 'ArrowLeft'), 'd');
    assert.equal(nextAlong(star, new Map(), 'c', 'ArrowUp'), 'd');
  });

  test('a graph can be walked from one end to the other without a pointer', () => {
    const chain = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
    ];
    const line = new Map(['a', 'b', 'c', 'd'].map((k, i) => [k, { x: i * 10, y: 0 }]));
    let at = 'a';
    for (const next of ['b', 'c', 'd']) ((at = nextAlong(chain, line, at, 'ArrowRight') ?? at), assert.equal(at, next));
    for (const next of ['c', 'b', 'a']) ((at = nextAlong(chain, line, at, 'ArrowLeft') ?? at), assert.equal(at, next));
  });
});

describe('what is brought forward, and what overrides what', () => {
  const some = (...things) => ({ things: new Set(things), edges: new Set() });
  test('a path over a focus over the legend; none of them, nothing', () => {
    assert.equal(emphasis({ focus: null, forward: null, route: null }), null);
    assert.deepEqual(sorted(emphasis({ focus: null, forward: some('a'), route: null }).things), ['a']);
    assert.deepEqual(sorted(emphasis({ focus: some('b'), forward: some('a'), route: null }).things), ['b']);
    assert.deepEqual(sorted(emphasis({ focus: some('b'), forward: some('a'), route: some('c') }).things), ['c']);
  });
});

describe('only the drawing changes, never the data', () => {
  const freeze = (v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      Object.freeze(v);
      for (const x of v instanceof Map ? [...v.values()] : Object.values(v)) freeze(x);
    }
    return v;
  };

  test('every step above leaves the reading, the drawing and the note’s text as they were', () => {
    const fresh = readNote([NOTE]);
    const d = freeze(fresh.graphs.get('reader'));
    // the note's own texts, frozen where they are: a write to one would throw; and the graph the reading holds, whose maps
    // and sets cannot be frozen, written out whole before and after
    const text = freeze(fresh.texts);
    const whole = () =>
      JSON.stringify(fresh.world.reader, (_k, v) => (v instanceof Map ? [...v] : v instanceof Set ? [...v] : v));
    assert.ok(whole().length > 100, 'the graph is written out in full');
    const before = JSON.stringify([d, text, whole(), propertiesOf(fresh, 'reader', { thing: 'tablet' })]);
    const es = edgesOf(d);
    const u = new Untangle(d);
    u.showOnly('q', 2);
    u.layers(null);
    u.legend.choose('kind:Option');
    u.legend.choose('type:ANSWERS');
    u.legend.choose('type:ANSWERS');
    u.layers({ things: new Set(['q']), edges: new Set() });
    u.route('tablet', 'large');
    u.route('q', 'island');
    kindLegend(d);
    neighbourhood(es, 'eyes', 2);
    shortestPath(es, 'q', 'island');
    find(fresh, 'reader', 'a');
    nextAlong(es, new Map(), 'q', 'ArrowRight');
    u.showAll();
    u.clearRoute();
    assert.equal(JSON.stringify([d, text, whole(), propertiesOf(fresh, 'reader', { thing: 'tablet' })]), before);
    assert.equal(fresh.texts[0], NOTE, 'the note’s text itself');
  });
});
