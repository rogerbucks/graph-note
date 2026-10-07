// Drawing a graph (spec §3): laid out by the Graphviz engine in each direction the style lists, the one that fits the
// note best chosen, and themed — as graph_svg.render does. And what tapping a box shows: its text, its kind, its links
// in and out, and any problem on it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine, draw, details } from '../src/render.ts';
import { layoutSource } from '../src/layout.ts';
import { themed, sizeOf, choose } from '../src/theme.ts';

const WIDE = `// graph: g
(q:Question {title: 'Which device?'}),
${Array.from({ length: 8 }, (_, i) => `(o${i}:Option {name: 'Option number ${i}'}), (o${i})-[:ANSWERS]->(q)`).join(',\n')}`;
const CHAIN = `// graph: g
${Array.from({ length: 6 }, (_, i) => `(s${i}:Step {name: 'Step ${i}'})`).join(', ')},
${Array.from({ length: 5 }, (_, i) => `(s${i})-[:THEN]->(s${i + 1})`).join(', ')}`;

describe('drawing', () => {
  test('the engine starts offline and names its Graphviz version', async () => {
    const engine = await loadEngine();
    assert.match(engine.version, /^\d+\.\d+\.\d+$/);
  });

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

  test('an id that is not in the graph has no details', () => {
    assert.equal(details(readNote(note), 'reader', 'missing'), null);
  });
});

describe('speed', () => {
  test('a graph of 50 things is read and drawn in under half a second (spec §11; the phone is checked on the device)', async () => {
    const engine = await loadEngine();
    const nodes = Array.from(
      { length: 50 },
      (_, i) =>
        `(n${i}:${['Question', 'Option', 'Reason', 'Claim', 'Source'][i % 5]} {name: 'Thing ${i}, a few words long'})`,
    );
    const links = Array.from(
      { length: 70 },
      (_, i) => `(n${i % 50})-[:${['ANSWERS', 'FAVOURS', 'CITES'][i % 3]}]->(n${(i * 7 + 3) % 50})`,
    );
    const block = `// graph: g\n${[...nodes, ...links].join(',\n')}`;
    draw(readNote([block]).graphs.get('g'), engine); // warm: the first draw compiles the engine's code paths
    const t = performance.now();
    const drawn = draw(readNote([block]).graphs.get('g'), engine);
    const ms = performance.now() - t;
    assert.match(drawn.svg, /^<svg/);
    assert.ok(ms < 500, `${ms.toFixed(0)} ms`);
  });
});

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
