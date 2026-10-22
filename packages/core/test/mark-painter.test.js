// Painting marks on a canvas (editor spec §53, scale_painters): mark-painter.ts. The device's best painter is picked by
// trying each, and the 2D canvas painter paints every kind of mark, as the camera sees it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasPainter, paintsOf, pickPainter } from '../src/display/graph-view/mark-painter.ts';
import { PALETTES } from '../src/palette.ts';

/** A stand-in 2D canvas that writes down each call it is given, with the colours set when it fills or strokes. */
function fakeCanvas() {
  const calls = [];
  const ctx = new Proxy(
    { fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '', lineWidth: 1 },
    {
      get(target, name) {
        if (name in target) return target[name];
        return (...args) => {
          const at =
            name === 'fill' || name === 'fillText'
              ? target.fillStyle
              : name === 'stroke'
                ? target.strokeStyle
                : undefined;
          calls.push([
            name,
            ...args.map((a) => (typeof a === 'number' ? Math.round(a * 100) / 100 : a)),
            ...(at ? [at] : []),
          ]);
        };
      },
      set(target, name, value) {
        target[name] = value;
        return true;
      },
    },
  );
  const canvas = { width: 0, height: 0, getContext: (kind) => (kind === '2d' ? ctx : null) };
  return { canvas, ctx, calls };
}

const paints = (style) =>
  ({ thing: { fill: 'F', line: 'L' }, link: { line: 'E' }, name: { text: 'T' }, bare: {} })[style] ?? {};

test('the first painter the device can make is picked; one that fails or throws is passed over', async () => {
  const made = (kind) => () => ({ kind, resize() {}, paint() {}, painted: async () => {}, destroy() {} });
  const tried = [];
  const picked = await pickPainter({}, [
    () => (tried.push('webgpu'), Promise.reject(new Error('no adapter'))),
    () => (tried.push('webgl2'), null),
    () => (tried.push('canvas'), made('canvas')()),
    () => (tried.push('never'), made('never')()),
  ]);
  assert.equal(picked.kind, 'canvas');
  assert.deepEqual(tried, ['webgpu', 'webgl2', 'canvas']);
  assert.equal(await pickPainter({}, [() => null]), null, 'null only when none can paint');
  assert.equal((await pickPainter({}, [async () => made('webgpu')(), made('canvas')])).kind, 'webgpu');
});

test('a canvas with no 2D context gives no painter', () => {
  assert.equal(canvasPainter({ getContext: () => null }), null);
});

test('the canvas is sized in device pixels, and each frame drawn at the device ratio', () => {
  const { canvas, calls } = fakeCanvas();
  const p = canvasPainter(canvas);
  p.resize(300, 200, 2);
  assert.deepEqual([canvas.width, canvas.height], [600, 400]);
  p.paint([], { x: 0, y: 0, scale: 1 }, paints);
  assert.deepEqual(calls, [
    ['setTransform', 1, 0, 0, 1, 0, 0],
    ['clearRect', 0, 0, 600, 400],
    ['setTransform', 2, 0, 0, 2, 0, 0],
  ]);
});

test('boxes, links, labels and arrowheads are painted as the camera sees them, in their own colours', () => {
  const { canvas, calls } = fakeCanvas();
  const p = canvasPainter(canvas);
  p.resize(100, 100, 1);
  const marks = [
    { id: 'b', kind: 'box', style: 'thing', x: 20, y: 30, width: 40, height: 10 },
    {
      id: 'l',
      kind: 'link',
      style: 'link',
      points: [
        [20, 30],
        [60, 30],
        [60, 50],
      ],
    },
    { id: 't', kind: 'label', style: 'name', x: 40, y: 38, text: 'Ada', size: 8, anchor: 'middle', maxWidth: 30 },
    { id: 'a', kind: 'arrowhead', style: 'link', x: 60, y: 50, angle: 90, size: 4 },
  ];
  p.paint(marks, { x: 10, y: 20, scale: 2 }, paints);
  const drawn = calls.slice(3);
  assert.deepEqual(drawn.slice(0, 5), [
    ['beginPath'],
    ['rect', 20, 20, 80, 20],
    ['fill', 'F'],
    ['stroke', 'L'],
    ['beginPath'],
  ]);
  assert.deepEqual(drawn.slice(5, 9), [
    ['moveTo', 20, 20],
    ['lineTo', 100, 20],
    ['lineTo', 100, 60],
    ['stroke', 'E'],
  ]);
  assert.deepEqual(drawn[9], ['fillText', 'Ada', 60, 36, 60, 'T']);
  // the arrowhead points down (90 degrees): its tip at the link's end, its back 8 pixels above
  const head = drawn.slice(10);
  assert.deepEqual(head[1], ['moveTo', 100, 60]);
  assert.deepEqual(head[2], ['lineTo', 104, 52]);
  assert.deepEqual(head[3], ['lineTo', 96, 52]);
  assert.deepEqual(head.at(-1), ['fill', 'E']);
});

test('over a graphics chip painter, only the text is painted; a mark with no paint is not painted', () => {
  const { canvas, calls } = fakeCanvas();
  const p = canvasPainter(canvas, true);
  p.resize(100, 100, 1);
  p.paint(
    [
      { id: 'b', kind: 'box', style: 'thing', x: 0, y: 0, width: 4, height: 4 },
      { id: 't', kind: 'label', style: 'name', x: 1, y: 2, text: 'A', size: 8, anchor: 'start' },
      { id: 'u', kind: 'label', style: 'bare', x: 1, y: 2, text: 'B', size: 8, anchor: 'start' },
    ],
    { x: 0, y: 0, scale: 1 },
    paints,
  );
  assert.deepEqual(calls.slice(3), [['fillText', 'A', 1, 2, 'T']]);
});

test('each style token is painted from the palette; one not named takes the paint of the token it starts with', () => {
  const p = paintsOf(PALETTES.light);
  assert.equal(p('overview.link').line, PALETTES.light.edge);
  assert.equal(p('overview.count').text, PALETTES.light.muted);
  assert.equal(p('thing.dashed'), p('thing'));
  assert.deepEqual(p('nothing-named'), { line: PALETTES.light.edge, text: PALETTES.light.text });
});
