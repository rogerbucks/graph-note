// A graph that names a shared schema there is none of (spec §27, schema_named_found). An example is `· schema places@2`
// with no block that says SCHEMA places@2 in the vault, nor a standard schema of that name. Its types then go
// unchecked. So it is a warning on the graph line of the first block that names it, saying which versions of that
// schema there are.
import type { World } from '@thoughtknot/graph-spec';
import { firstLine, graphOfBlock } from './blocks.ts';
import type { Problem } from './note-reading.ts';
import { N, S } from './whitespace.ts';
import { word } from './words.ts';

const NAMES = new RegExp(`·${S}*schema${S}+(${N}+)`);
const base = (name: string) => name.replace(/@[^@]*$/, '');

/** A warning for each graph whose blocks name a shared schema the world does not hold, on the first block naming it. */
export function missingSchemas(world: World, texts: string[]): Problem[] {
  const held = Object.keys((world as { __schemas?: Record<string, unknown> }).__schemas ?? {}).sort();
  const out: Problem[] = [];
  const said = new Set<string>();
  texts.forEach((text, block) => {
    const graph = graphOfBlock(text),
      line = firstLine(text),
      m = NAMES.exec(line);
    const name = m?.[1];
    if (!graph || !m || !name || held.includes(name) || said.has(graph)) return;
    said.add(graph);
    const others = held.filter((h) => base(h) === base(name));
    const character = (m.index ?? 0) + m[0].length - name.length + text.indexOf(line);
    out.push({
      graph,
      block,
      line: 1,
      severity: 'warning',
      message: word('reading.schema.missing', { name, graph }),
      code: 'GN717',
      fix: others.length
        ? word('reading.schema.missing.version', { versions: others.join(', ') })
        : word('reading.schema.missing.fix', { name }),
      ...(others.length
        ? { replace: { written: name, with: others }, span: { line: 0, character, end: character + name.length } }
        : {}),
    });
  });
  return out;
}
