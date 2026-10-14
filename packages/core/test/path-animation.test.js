// A played path exported as an animated SVG (editor spec §7, path_animation_export): CSS inside the file moves a heavier
// outline from step to step at the pace set, and a dot along the link between two steps that a link joins, with no
// encoder and nothing loaded from elsewhere; still under reduced motion, every step outlined and numbered and the order
// said in words (motion_reduced_respected, motion_not_alone); and refused before it starts when it is too large for the
// device, saying why and what would make it fit (animation_export_fits). Spans path-animation.ts and export.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { exportSvg, exportWithLayout } from '../src/export.ts';
import { exportScope } from '../src/export-scope.ts';
import { PALETTES } from '../src/palette.ts';
import { ANIMATION_LIMITS, animationFits, pathPlan } from '../src/path-animation.ts';
import { pathsOf } from '../src/paths.ts';
import { chosen, directions } from '../src/render.ts';

const engine = await loadEngine();

const WALKED = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(home)-[:VISITS]->(cafe),
(tour:Path {title: 'Sunday walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 3}]->(cafe),
(tour)-[:STEP {seq: 4}]->(home)`;

const reading = readNote([WALKED]);
const tour = pathsOf(reading, 'trip')[0];
const scope = exportScope(reading, { graph: 'trip' });
const info = (walk) => ({ note: 'Trips/Trip.md', date: '2026-10-14', theme: 'light', walk });
const exported = (pace = 1000) => exportSvg(scope, engine, info({ path: tour, pace })).svg;
const sheetOf = (svg) => /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '';
const texts = (svg) => [...svg.matchAll(/>([^<>]+)<\/(?:text|tspan)>/g)].map((m) => m[1]);

describe('a played path exported as an animated SVG', () => {
  // proves: path_animation_export
  test('a heavier outline moves from step to step at the pace set, round and round, by CSS in the file', () => {
    const svg = exported(1000);
    const sheet = sheetOf(svg);
    // the path is drawn over the drawing's things: home is steps 1 and 4, park 2, cafe 3
    const nodes = [...sheet.matchAll(/@keyframes graph-note-step-(\d+)/g)].map((m) => Number(m[1]));
    assert.equal(nodes.length, 3, 'one animation for each thing stepped on');
    for (const n of nodes)
      assert.match(
        sheet,
        new RegExp(`#node${n} > path[^{]*\\{[^}]*animation: graph-note-step-${n} 4s step-end infinite`),
      );
    assert.doesNotMatch(svg, /<script|<image|href="http/, 'nothing runs and nothing is loaded from elsewhere');
  });

  // proves: path_animation_export
  test('each thing holds the heavier outline only for its own steps', () => {
    const plan = pathPlan(scope.drawing, tour, []);
    const node = (key) => scope.drawing.boxes.findIndex((b) => b.key === key) + 1;
    assert.equal(plan.steps, 4);
    assert.deepEqual(plan.nodes.get(node('home')), [0, 3]);
    assert.deepEqual(plan.nodes.get(node('park')), [1]);
    assert.deepEqual(plan.nodes.get(node('cafe')), [2]);
    const sheet = sheetOf(exported(1000));
    const home = new RegExp(`@keyframes graph-note-step-${node('home')} \\{([^@]*?)\\}\\s*(?:#|@|$)`).exec(sheet)?.[1];
    assert.match(home, /0% \{ stroke-width: 6; \}/);
    assert.match(home, /25% \{ stroke-width: 3; \}/);
    assert.match(home, /75% \{ stroke-width: 6; \}/);
  });

  // proves: path_animation_export, links_show_flow
  test('a dot travels the link between two steps a link joins, forwards along the walk, even against the link', () => {
    const plan = pathPlan(scope.drawing, tour, []);
    // home to park along NEAR (the first link); cafe to home against VISITS (the second); park to cafe has no link
    assert.deepEqual(
      plan.runners.map((r) => [r.edge, r.slot, r.back]),
      [
        [1, 1, false],
        [2, 3, true],
      ],
    );
    const svg = exported(1000);
    assert.equal((svg.match(/class="graph-note-path-runner"/g) ?? []).length, 2);
    assert.match(sheetOf(svg), /@keyframes graph-note-run-1/);
  });

  // proves: path_animation_export
  test('the pace set is the pace played: half a second a step makes the round two seconds', () => {
    assert.match(sheetOf(exported(500)), /animation: graph-note-step-\d+ 2s step-end infinite/);
  });
});

describe('still under reduced motion, and never told by movement alone', () => {
  // proves: motion_reduced_respected
  test('under reduced motion every animation stops, the dots are hidden, and every step stays outlined', () => {
    const sheet = sheetOf(exported());
    const [moving, still] = sheet.split('@media (prefers-reduced-motion: reduce)');
    const animated = [...moving.matchAll(/([^{}]+)\{[^}]*animation:[^}]*\}/g)].map((m) => m[1].trim());
    assert.ok(animated.length >= 4, sheet);
    for (const selector of animated) assert.ok(still.includes(selector), `${selector} is still under reduced motion`);
    assert.match(still, /animation: none/);
    assert.match(still, /\.graph-note-path-runner \{ display: none; \}/);
    assert.match(moving, /stroke-width: 3;/, 'every step outlined when nothing moves');
  });

  // proves: motion_not_alone
  test('each step is numbered on its thing, and the frame says the walk in order, in words', () => {
    const svg = exported(2000);
    const said = texts(svg);
    assert.ok(said.includes('1, 4'), 'home is steps 1 and 4');
    assert.ok(said.includes('2') && said.includes('3'));
    // the frame wraps its lines at spaces, so the words are read across them
    const all = said.join(' ');
    assert.ok(all.includes('1 Home → 2 The park → 3 Cafe → 4 Home'), all);
    assert.ok(all.includes('2 seconds a step'), all);
    assert.ok(
      said.some((t) => t.startsWith('trip · path Sunday walk')),
      said.join(' | '),
    );
  });
});

describe('an animated SVG too large for the device is refused before it starts', () => {
  const sized = (steps, things = 10, links = 10) => ({ steps, things, links });

  // proves: animation_export_fits
  test('within the limits it fits; past them it is refused, saying why and what would make it fit', () => {
    assert.equal(animationFits(sized(4), 'phone'), null);
    const phone = ANIMATION_LIMITS.phone.steps;
    assert.equal(animationFits(sized(phone), 'phone'), null);
    const long = animationFits(sized(phone + 1), 'phone');
    assert.deepEqual(long, {
      why: `the path has ${phone + 1} steps, more than the ${phone} an animated SVG can play smoothly on this phone`,
      fix: `export a path of ${phone} steps or fewer, such as part of this one recorded as a path of its own, or export the drawing as a still SVG`,
    });
    assert.equal(animationFits(sized(phone + 1), 'desktop'), null, 'a computer takes more');
    const big = animationFits(sized(10, 20000, 20000), 'desktop');
    assert.match(
      big.why,
      /^the animated SVG would be about \d+(\.\d)? MB, more than the \d+ MB this computer opens smoothly$/,
    );
    assert.match(big.fix, /view that holds the path/);
  });

  // proves: animation_export_fits
  test('the export asks for no layout at all when the path is too long for the device', async () => {
    let asked = 0;
    const layout = async (d, theme) => {
      asked++;
      const laid = directions(d);
      return chosen(
        laid,
        laid.map((x) => engine.render(x.dot)),
        theme === 'dark' ? PALETTES.dark : PALETTES.light,
      );
    };
    const long = { ...tour, steps: Array.from({ length: ANIMATION_LIMITS.phone.steps + 1 }, () => tour.steps[0]) };
    const out = await exportWithLayout(scope, layout, { ...info({ path: long, pace: 1000 }), device: 'phone' });
    assert.equal(asked, 0);
    assert.match(out.why, /more than the 200/);
    assert.ok(out.fix);
    const fits = await exportWithLayout(scope, layout, { ...info({ path: tour, pace: 1000 }), device: 'phone' });
    assert.equal(asked, 1);
    assert.match(fits.svg, /graph-note-step-/);
  });
});
