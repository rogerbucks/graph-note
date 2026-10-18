// Drawing a graph (spec §3). It is laid out by the Graphviz engine in each direction the style lists. The one that fits
// the note best is chosen and themed, as graph_svg.render does. And what tapping a box shows: its text, its kind, its
// links in and out, and any problem on it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { draw, details, directions, chosen } from '../src/render.ts';
import { PALETTES } from '../src/palette.ts';
import { loadEngine } from '../src/engine.ts';
import { layoutSource } from '../src/layout.ts';
import { themed, sizeOf, choose } from '../src/theme.ts';
import { foldedSource, routedSource } from '../src/fold-source.ts';

const WIDE = `// graph: g
(q:Question {title: 'Which device?'}),
${Array.from({ length: 8 }, (_, i) => `(o${i}:Option {name: 'Option number ${i}'}), (o${i})-[:ANSWERS]->(q)`).join(',\n')}`;
const CHAIN = `// graph: g
${Array.from({ length: 6 }, (_, i) => `(s${i}:Step {name: 'Step ${i}'})`).join(', ')},
${Array.from({ length: 5 }, (_, i) => `(s${i})-[:THEN]->(s${i + 1})`).join(', ')}`;

describe('drawing', () => {
  test('each graph is laid out both ways and the better fit is drawn, themed', async () => {
    const engine = await loadEngine();
    for (const g of [WIDE, CHAIN]) {
      const drawing = readNote([g]).graphs.get('g');
      const laid = ['LR', 'TB'].map((rankdir) => {
        const src = layoutSource(drawing, rankdir),
          svg = engine.render(src.source);
        return { rankdir, ...sizeOf(svg), svg, src };
      });
      const best = choose(laid);
      const drawn = draw(drawing, engine);
      assert.equal(drawn.rankdir, best.rankdir);
      assert.equal(drawn.svg, themed(best.svg, best.src.kinds, best.src.readings));
      assert.equal(drawn.width, best.width);
      assert.equal(drawn.height, best.height);
    }
  });

  // proves: untangle_hubs, untangle_routing
  test('a drawing folded and routed is laid out from the source folded, then routed, in each direction', () => {
    const drawing = readNote([WIDE]).graphs.get('g');
    const folding = { hidden: ['o1'], folded: [1], hubs: [], groups: [], merge: false };
    const laid = directions({ ...drawing, folding, routing: 'straight' });
    assert.deepEqual(
      laid.map((d) => d.rankdir),
      ['LR', 'TB'],
    );
    for (const d of laid) {
      assert.equal(d.dot, routedSource(foldedSource(layoutSource(drawing, d.rankdir).source, folding), 'straight'));
      assert.ok(!d.dot.includes('"o1"'));
    }
  });

  test('a host that lays out elsewhere, as a Claude Code pane does, is themed in its own palette from the one table', async () => {
    const engine = await loadEngine();
    const drawing = readNote([WIDE]).graphs.get('g');
    const laid = directions(drawing),
      svgs = laid.map((d) => engine.render(d.dot));
    assert.match(chosen(laid, svgs).svg, /var\(--text-normal\)/, "Obsidian's by default");
    const dark = chosen(laid, svgs, PALETTES.dark);
    const best = laid.find((d) => d.rankdir === dark.rankdir);
    assert.equal(dark.svg, themed(svgs[laid.indexOf(best)], best.src.kinds, best.src.readings, PALETTES.dark));
  });

  test('a graph with no things is drawn empty, not refused', async () => {
    const engine = await loadEngine();
    const drawn = draw({ graph: 'g', boxes: [], links: [] }, engine);
    assert.match(drawn.svg, /^<svg/);
  });

  test('when the engine fails, the failure is said, not swallowed', () => {
    const broken = {
      version: '0.0.0',
      render() {
        throw new Error('out of memory');
      },
    };
    assert.throws(() => draw(readNote([CHAIN]).graphs.get('g'), broken), /out of memory/);
  });

  test('each box and link in the drawing can be found again by its place in the graph', async () => {
    const engine = await loadEngine();
    const drawing = readNote([WIDE]).graphs.get('g');
    const drawn = draw(drawing, engine);
    const nodeIds = [...drawn.svg.matchAll(/<g id="(node\d+)" class="node"/g)].map((m) => m[1]);
    const edgeIds = [...drawn.svg.matchAll(/<g id="(edge\d+)" class="edge"/g)].map((m) => m[1]);
    assert.deepEqual(
      nodeIds,
      drawing.boxes.map((_, i) => `node${i + 1}`),
    );
    assert.deepEqual(
      edgeIds,
      drawing.links.map((_, i) => `edge${i + 1}`),
    );
    // the order is the layout source's order: check it against the titles Graphviz writes before theming removes them
    const raw = engine.render(layoutSource(drawing, drawn.rankdir).source);
    const titles = [...raw.matchAll(/<g id="node(\d+)" class="node">\s*<title>([^<]*)<\/title>/g)].map((m) => [
      Number(m[1]),
      m[2],
    ]);
    titles.forEach(([n, key]) => assert.equal(drawing.boxes[n - 1].key, key));
  });
});

describe('what tapping a box shows', () => {
  const note = [
    `// graph: reader
(q:Question {title: 'Which device?'}), (large:Option {name: 'Large reader'}), (tablet:Option {name: 'Tablet'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(q), (tablet)-[:ANSWERS]->(q), (eyes)-[:FAVOURS]->(large), (eyes)-[:COUNTS_AGAINST]->(tablet)`,
  ];

  test('its text, its kind, and its links in and out, each read in words with the thing at the other end', () => {
    const reading = readNote(note);
    assert.deepEqual(details(reading, 'reader', 'large'), {
      key: 'large',
      text: 'Large reader',
      kind: 'Option',
      out: [{ reading: 'answers', key: 'q', text: 'Which device?' }],
      in: [{ reading: 'favours', key: 'eyes', text: 'Easy on the eyes' }],
      problems: [],
    });
  });

  test('a thing nothing links to says so by having no links, not by failing', () => {
    const reading = readNote([note[0] + ",\n(alone:Note {name: 'Alone'})"]);
    const d = details(reading, 'reader', 'alone');
    assert.deepEqual([d.in, d.out], [[], []]);
  });

  test('a problem on a line that names the thing is shown with it', () => {
    const reading = readNote([note[0] + ',\n(eyes)-[:FAVOURS]->(nowhere)']);
    const d = details(reading, 'reader', 'eyes');
    assert.equal(d.problems.length, 1);
    assert.match(d.problems[0].message, /nowhere/);
  });

  test('a box drawn under a suggested name shows the warning that suggests it, with its fix; others show none', () => {
    const text = note[0] + ",\n(:Option {name: 'Small reader'})";
    const reading = readNote([text]);
    const d = details(reading, 'reader', 'small_reader');
    assert.equal(d.text, 'Small reader');
    assert.equal(d.suggested?.suggested, 'small_reader');
    assert.equal(d.suggested?.fixTitle, 'Add the name small_reader');
    assert.deepEqual(d.suggested?.insert, { line: 4, character: 1, text: 'small_reader' });
    assert.deepEqual(
      d.problems.map((p) => p.message),
      ['this thing has no name; suggested: small_reader'],
    );
    assert.equal(details(reading, 'reader', 'large').suggested, undefined);
    assert.deepEqual(details(reading, 'reader', 'large').problems, []);
  });

  test('an id that is not in the graph has no details', () => {
    assert.equal(details(readNote(note), 'reader', 'missing'), null);
  });
});

// How fast a graph of 50 things is read and drawn (spec §11, fifty_in_half_second) is not asserted here. A test asserts
// the work done, never the time taken (spec §12, quality_ratchet, 12 Oct 2026). Its instructions are counted by the
// draw_fifty benchmark (scripts/benchmarks/draw-fifty.mjs), on every release, and the phone is checked on the device.

describe('what tapping a link shows', () => {
  const block = `// graph: reader
(q:Question {title: 'Which device?'}), (large:Option {name: 'Large reader'}), (notes:Source {title: 'Trial notes'}),
(large)-[:ANSWERS]->(q),
(large)-[:CITES {where: 'day 2', checked: TRUE, on: DATE '2026-10-01'}]->(notes)`;

  test('its type and reading, the things at either end, and its properties', async () => {
    const { linkDetails } = await import('../src/render.ts');
    assert.deepEqual(linkDetails(readNote([block]), 'reader', 1), {
      index: 1,
      type: 'CITES',
      reading: 'cites',
      from: { key: 'large', text: 'Large reader' },
      to: { key: 'notes', text: 'Trial notes' },
      properties: [
        ['checked', 'true'],
        ['on', '2026-10-01'],
        ['where', 'day 2'],
      ],
      problems: [],
    });
    assert.deepEqual(linkDetails(readNote([block]), 'reader', 0).properties, []);
  });

  test('a problem on its line is shown with it', async () => {
    const { linkDetails } = await import('../src/render.ts');
    const r = readNote([block + ',\n(large)-[:CITES]->(nowhere)']);
    assert.equal(linkDetails(r, 'reader', 1).problems.length, 0, 'not another link’s problem');
    const bad = readNote([
      block.replace('(large)-[:ANSWERS]->(q)', '(large)-[:ANSWERS]->(q), (large)-[:ANSWERS]->(nowhere)'),
    ]);
    assert.equal(linkDetails(bad, 'reader', 0).problems.length, 1);
  });

  test('a link that is not there has no details', async () => {
    const { linkDetails } = await import('../src/render.ts');
    assert.equal(linkDetails(readNote([block]), 'reader', 9), null);
  });
});
