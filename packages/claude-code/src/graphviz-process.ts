// Graphviz for the Claude Code host (spec §10; decision of 11 Oct 2026): a mod has no WebAssembly, so the core's own
// engine runs as a process through node, DOT in and SVG out (bin/render-process.ts). When node is missing it is said in
// words, so the pane shows the graph as text with the reason, never a blank drawing.

/** What a process gave back, as the host's `$.process.run` resolves it. */
export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs a command by its argument vector with `stdin` handed in; rejects when the command cannot start. */
export type RunProcess = (argv: readonly string[], stdin: string) => Promise<ProcessResult>;

/** Graphviz's answer: an SVG for each source, in order, or why there is none. */
export type Laid = { svgs: string[] } | { why: string };

/** Where the built render script sits in the mod. */
export const RENDER_SCRIPT = 'bin/render.mjs';

/** What the pane says when node cannot be started. */
export const NODE_MISSING =
  'Graphviz runs through Node.js, and node could not be started. Install Node.js 24 or later (nodejs.org), make sure ' +
  '`node` is on the path Claude Code starts with, and run /graph again. The graph is shown as text meanwhile.';

const SAID_MAX = 200;
const cut = (s: string) => (s.length > SAID_MAX ? `${s.slice(0, SAID_MAX - 1)}…` : s);
const firstLines = (s: string) => cut(s.trim().replace(/\s*\n\s*/g, ' '));

/** Asks node itself whether it starts, after a run was refused, so a missing node is told from a layout that failed. */
async function nodeStarts(run: RunProcess): Promise<boolean> {
  try {
    return (await run(['node', '--version'], '')).exitCode === 0;
  } catch {
    return false;
  }
}

/** Lays out each DOT source with the core's engine, run by node from the mod at `root`. */
export async function layOut(dots: string[], root: string, run: RunProcess): Promise<Laid> {
  let ran: ProcessResult;
  try {
    ran = await run(['node', `${root}/${RENDER_SCRIPT}`], JSON.stringify(dots));
  } catch (err) {
    if (!(await nodeStarts(run))) return { why: NODE_MISSING };
    return { why: `Graphviz did not finish: ${firstLines(err instanceof Error ? err.message : String(err))}` };
  }
  // a shell or env wrapper says "command not found" with 127
  if (ran.exitCode === 127) return { why: NODE_MISSING };
  if (ran.exitCode !== 0) return { why: `Graphviz failed: ${firstLines(ran.stderr) || `exit code ${ran.exitCode}`}` };
  let svgs: unknown;
  try {
    svgs = JSON.parse(ran.stdout);
  } catch {
    svgs = null;
  }
  if (!Array.isArray(svgs) || svgs.length !== dots.length || !svgs.every((s) => typeof s === 'string'))
    return { why: 'Graphviz gave no drawing: its output was not one SVG for each layout.' };
  return { svgs };
}
