#!/usr/bin/env node
// The scale benchmark (editor spec §53, scale_benchmark). It opens, draws, pans and edits graphs of growing size. It
// starts with the huge graph of device check V-10 and goes up to one hundred copies of it. For each step it records
// the time taken and the memory kept. A step over its budget (scale-budgets.mjs) fails the run, so a change that makes
// big graphs slower is caught.
//
// Each step runs the way the hosts run it today. A step that is refused, such as a graph over the read limit, records
// its refusal and the time the refusal took. A step not built yet, such as panning an overview, records that and no
// numbers. As the massive-graphs work lands (wiki/Massive-graphs-design.md, way E), the steps grow to match it.
//
// Times are wall-clock, so they vary between machines. The budgets leave room for that. This is not the instruction-count
// ratchet of scripts/instruction-counts.mjs, which counts small fixed pieces of work exactly.
//
// Usage, each with `node --expose-gc scripts/scale-benchmark.mjs` and then:
// - nothing: run every size and print a table. It exits 1 if a step is over budget.
// - `--sizes 1,10`: run only these sizes, as copies of V-10.
// - `--json`: print the records as JSON instead.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gqlBlocks } from '../packages/core/src/blocks.ts';
import { readNote } from '../packages/core/src/drawing.ts';
import { LAYOUT_LIMITS, tooLarge } from '../packages/core/src/layout-limits.ts';
import { setNote } from '../packages/core/src/note-edit.ts';
import { groupsOf } from '../packages/core/src/scale-groups.ts';
import { SCALE_BUDGETS } from './benchmarks/scale-budgets.mjs';
import { NOTE } from './make-huge-graph.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The sizes measured, as copies of the V-10 graph: 2,666 things up to 266,600. */
export const SIZES = [1, 10, 100];

/** The graph block of the V-10 note. */
export function hugeBlock() {
  const block = gqlBlocks(readFileSync(resolve(ROOT, NOTE), 'utf8')).find((b) => b.text.startsWith('// graph: huge'));
  if (!block) throw new Error(`${NOTE} has no block that starts "// graph: huge"`);
  return block.text;
}

/**
 * A graph of `times` copies of `block`. Each copy's keys end in `_c` and its number, so no two copies share a thing.
 * Each copy after the first is linked to the one before it by its first thing, so the graph stays in one piece.
 */
export function grown(block, times) {
  if (times === 1) return block;
  const [head, ...body] = block.split('\n');
  const first = body.join('\n').match(/^\((\w+)[:\s)]/m)?.[1];
  const copies = Array.from({ length: times }, (_, c) => {
    const keyed = body.join('\n').replace(/\((\w+)(?=[\s:){])/g, `($1_c${c}`);
    return c === 0 ? keyed : `${keyed.replace(/,?\s*$/, ',')}\n(${first}_c${c})-[:FOLLOWS]->(${first}_c${c - 1})`;
  });
  return [head, ...copies.map((c, i) => (i < times - 1 ? c.replace(/,?\s*$/, ',') : c))].join('\n');
}

/**
 * The steps, each as the hosts do it today. Each is given what the steps before it made, and gives back its outcome:
 * `done`, `refused: <why>` or `not built: <what>`, and what the next steps need.
 */
export const STEPS = {
  open({ block }) {
    const reading = readNote([block]);
    if (reading.tooLarge) return { outcome: `refused: over the read limit on ${reading.tooLarge.limit}` };
    const drawing = reading.graphs.get('huge');
    return { outcome: 'done', drawing, things: drawing.boxes.length, links: drawing.links.length };
  },
  draw({ drawing }) {
    if (!drawing) return { outcome: 'not built: nothing was read to draw' };
    const refusal = tooLarge(drawing, LAYOUT_LIMITS);
    // over the drawing limit, the card shows the graph's text in place of a drawing (layout_contained)
    return { outcome: refusal ? `refused: over the drawing limit on ${refusal.limit}, shown as text` : 'done' };
  },
  group({ drawing, times }) {
    // past the read limit, the groups are found on copies of the V-10 drawing, made outside the time taken
    const made = drawing ?? copied(times);
    const start = performance.now();
    const { groups } = groupsOf(made);
    const ms = performance.now() - start;
    const most = Math.max(...groups.map((g) => g.keys.length));
    return {
      outcome: `done: ${groups.length} groups, the largest ${most} things${drawing ? '' : ', on copies not read'}`,
      ms,
    };
  },
  pan() {
    return { outcome: 'not built: the overview (way E, step 4)' };
  },
  edit({ block }) {
    const first = block.match(/^\((\w+)[:\s)]/m)?.[1];
    const edit = setNote(block, { thing: first }, 'Checked by the scale benchmark.');
    if (!edit.ok) return { outcome: `refused: ${edit.reason}` };
    // an edit is read again, as the card reads the note the edit wrote
    const reading = readNote([edit.text]);
    return { outcome: reading.tooLarge ? `refused: over the read limit on ${reading.tooLarge.limit}` : 'done' };
  },
};

/** A drawing of `times` copies of the V-10 drawing, made without reading them, for the steps after reading. */
function copied(times) {
  const once = readNote([hugeBlock()]).graphs.get('huge'),
    boxes = [],
    links = [];
  for (let c = 0; c < times; c++) {
    for (const b of once.boxes) boxes.push({ ...b, key: `${b.key}_c${c}` });
    for (const l of once.links) links.push({ ...l, from: `${l.from}_c${c}`, to: `${l.to}_c${c}` });
  }
  return { ...once, boxes, links, nudges: [] };
}

/** Megabytes of the heap in use, after collecting garbage when Node was started with --expose-gc. */
function heapMb() {
  globalThis.gc?.();
  return process.memoryUsage().heapUsed / 1e6;
}

/**
 * Runs `steps` in order on a graph of `times` copies of `block`. Gives back the graph's size and, for each step, its
 * outcome, the milliseconds it took and the megabytes of memory it kept. A step not built has no numbers.
 */
export async function measure(block, times, steps = STEPS, clock = () => performance.now()) {
  const text = grown(block, times);
  const record = { times, bytes: Buffer.byteLength(text), lines: text.split('\n').length, steps: {} };
  let made = { block: text, times };
  for (const [name, step] of Object.entries(steps)) {
    const before = heapMb(),
      start = clock();
    const out = await step(made);
    // a step that makes what it needs first says itself how long its own work took
    const { outcome, ms = clock() - start, ...rest } = out;
    made = { ...made, ...rest };
    record.steps[name] = outcome.startsWith('not built')
      ? { outcome, ms: null, mb: null }
      : { outcome, ms: Math.round(ms * 10) / 10, mb: Math.round(Math.max(0, heapMb() - before) * 10) / 10 };
  }
  record.things = made.things ?? null;
  record.links = made.links ?? null;
  return record;
}

/** What is over budget in `records`, one line each, naming the size, the step, what was measured and what is allowed. */
export function overBudget(records, budgets = SCALE_BUDGETS) {
  const over = [];
  for (const r of records)
    for (const [name, s] of Object.entries(r.steps)) {
      const most = budgets[name]?.[r.times];
      if (!most || s.ms === null) continue;
      if (s.ms > most.ms) over.push(`${r.times}× V-10, ${name}: ${s.ms} ms, where under ${most.ms} ms are allowed`);
      if (s.mb > most.mb)
        over.push(`${r.times}× V-10, ${name}: ${s.mb} MB kept, where under ${most.mb} MB are allowed`);
    }
  return over;
}

/** The records as a table, one row a step. */
export function table(records) {
  const rows = ['| Size | Step | Outcome | ms | MB kept |', '|---|---|---|---|---|'];
  for (const r of records)
    for (const [name, s] of Object.entries(r.steps))
      rows.push(
        `| ${r.times}× V-10 (${(r.bytes / 1e6).toFixed(1)} MB) | ${name} | ${s.outcome} | ${s.ms ?? '–'} | ${s.mb ?? '–'} |`,
      );
  return rows.join('\n');
}

async function main(args) {
  const at = args.indexOf('--sizes');
  const sizes = at >= 0 ? args[at + 1].split(',').map(Number) : SIZES;
  const block = hugeBlock();
  const records = [];
  for (const times of sizes) records.push(await measure(block, times));
  console.log(args.includes('--json') ? JSON.stringify(records, null, 2) : table(records));
  const over = overBudget(records);
  for (const line of over) console.error(`over budget: ${line}`);
  return over.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
