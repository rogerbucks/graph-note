// The graph blocks of a note (spec §3): where each gql fenced block is, and what its graph line says. That is the graph
// it draws and whether it holds data or a schema. It may hold a shared schema or one that names a shared schema. Or it
// may have a graph line that cannot be read.
import gs from '@thoughtknot/graph-spec';
import type { Problem } from './note-reading.ts';
import { N, S, SPACE, trim } from './whitespace.ts';

export { gqlBlocks, gqlSpans, type Span } from './fences.ts';

// the graph line, read with whitespace as GQL names it (§3), as the reader reads it
const GRAPH_OF = new RegExp(`^${S}*//${S}*graph:${S}*(${N}+)`),
  GRAPH_LINE = new RegExp(`^${S}*//${S}*graph:`),
  SHARED = new RegExp(`^${S}*//${S}*graph:[^\\n]*·${S}*SCHEMA${S}+${N}+`),
  NAMES_SHARED = new RegExp(`^${S}*//${S}*graph:[^\\n]*·${S}*schema${S}+${N}+`),
  STYLES = new RegExp(`^${S}*//${S}*graph:[^\\n]*·${S}*STYLE${S}+([^${SPACE}·]+)`),
  STYLE_WORD = new RegExp(`^${S}*//${S}*graph:[^\\n]*·${S}*STYLE(?:${S}|·|$)`),
  FROM_WORD = new RegExp(`^${S}*//${S}*graph:[^\\n]*·${S}*FROM(?:${S}|·|$)`);

/**
 * Whether a block draws its graph from somewhere else (editor spec §20, sources.ts). Its graph line says FROM and a
 * .gql file or a note, `// graph: trip · FROM Graphs/trip.gql`. Such a block holds no data of its own (`dataKind`).
 */
export const isSourceBlock = (text: string): boolean => FROM_WORD.test(firstLine(text));

const STEP_WORD = new RegExp(`^${S}*//${S}*graph:[^\\n]*·${S}*QUERY${S}+step\\b`);

/**
 * Whether a block is meant as a graph step (editor spec §20, steps.ts), by its graph line alone: `// graph: team ·
 * QUERY step colleagues`. It is cheap however long the block is, so the editing view can choose its card without
 * reading it.
 */
export const isStepBlock = (text: string): boolean => STEP_WORD.test(firstLine(text));

/**
 * The graph a style block styles (editor spec §2, style_block_in_note): its graph line says STYLE and the graph's name,
 * `// graph: trip_style · STYLE trip`. Null for any other block. A style block is never data to draw (`dataKind`).
 */
export const styleOf = (text: string): string | null => STYLES.exec(firstLine(text))?.[1] ?? null;

/** The graph a block names, or null. */
export const graphOf = (text: string): string | null => GRAPH_OF.exec(firstLine(text))?.[1] ?? null;

/** The first line of a text with anything on it, found line by line: a large block is never split whole to find it (§9). */
export function firstLine(text: string): string {
  for (let at = 0; ;) {
    const end = text.indexOf('\n', at),
      line = end === -1 ? text.slice(at) : text.slice(at, end);
    if (trim(line)) return line;
    if (end === -1) return '';
    at = end + 1;
  }
}

const isGraphLine = (text: string) => GRAPH_LINE.test(firstLine(text));

/**
 * The kind of a block, or null when it holds no data to draw. A query holds none (a view or a step among them), nor
 * does an excerpt or a change set. Nor does a style block (read only by style.ts) or a block drawn FROM elsewhere (read
 * only by sources.ts). Nor does a block with no graph line. A graph line that says STYLE but names no graph to style is
 * a problem, never data.
 */
export function dataKind(text: string): 'data' | 'schema' | null | Problem {
  if (styleOf(text) !== null || isSourceBlock(text)) return null;
  if (STYLE_WORD.test(firstLine(text))) {
    const own = graphOf(text) ?? '<name>';
    return {
      graph: null,
      block: -1,
      severity: 'error',
      line: 1,
      message: 'this style block names no graph to style, so it is not read',
      fix: `write the graph it styles after STYLE: '// graph: ${own} · STYLE <graph>'`,
    };
  }
  try {
    const [, kind] = gs.header(text);
    return kind === 'data' || kind === 'schema' ? kind : null;
  } catch (e) {
    if (!isGraphLine(text)) return null;
    const p = e instanceof gs.ProfileError ? e : null;
    return {
      graph: null,
      block: -1,
      severity: 'error',
      line: p?.line ?? 1,
      message: p?.msg ?? 'the graph line cannot be read',
      fix: p?.fix ?? "start the block with '// graph: <name>'",
      ...(p?.code ? { code: p.code } : {}),
    };
  }
}

/** Whether a block is a shared schema (§5): its graph line says SCHEMA and its name. */
export const isSharedSchema = (text: string): boolean => SHARED.test(firstLine(text));

/** Whether a block's graph is typed by a shared schema it names: its graph line says "schema" and the schema's name. */
export const namesSharedSchema = (text: string): boolean => NAMES_SHARED.test(firstLine(text));

/**
 * The graph a block draws: its name when it is a data block with a graph line, else null. Null is for a query, schema,
 * excerpt or plain code.
 */
export function graphOfBlock(text: string): string | null {
  return dataKind(text) === 'data' ? graphOf(text) : null;
}
