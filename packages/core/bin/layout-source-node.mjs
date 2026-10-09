/*
Writes the layout source of every graph in a set of notes, as the graph note editor lays it out — so the vault's conformance
suite can require it to be byte-identical to graph_svg.py's (spec §12, "same layout as Python").

Usage:
  node packages/core/bin/layout-source-node.mjs < request.json
  request:  {"notes": {"<path>": "<note text>", ...}, "shared": ["<a SCHEMA block>", ...]}
  answer:   {"<path>": {"<graph>": {"LR": "<source>", "TB": "<source>"}, ...}, ...}

Writes: nothing (prints to stdout).

Each note is read whole, as graph-spec-draw.py reads it, with the vault's shared schemas applied first. The layout source is
what graph_svg.py would lay out: estimated links are added only to what the editor draws, never to this.
*/
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { layoutSource } from '../src/layout.ts';

let input = '';
process.stdin.on('data', (d) => {
  input += d;
});
process.stdin.on('end', () => {
  const q = JSON.parse(input || '{}'),
    out = {};
  for (const [path, text] of Object.entries(q.notes ?? {})) {
    out[path] = {};
    try {
      const reading = readNote(
        gqlBlocks(text).map((b) => b.text),
        undefined,
        q.shared ?? [],
      );
      for (const [graph, d] of reading.graphs)
        out[path][graph] = { LR: layoutSource(d, 'LR').source, TB: layoutSource(d, 'TB').source };
    } catch (e) {
      out[path] = { error: String(e?.message ?? e) };
    }
  }
  process.stdout.write(JSON.stringify(out));
});
