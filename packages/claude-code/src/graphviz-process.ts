// Graphviz for the Claude Code host (spec §10; decision of 11 Oct 2026): a mod has no WebAssembly, so the core's own
// engine runs as a process through node, DOT in and SVG out (bin/render-process.ts). When node is missing it is said in
// words, so the pane shows the graph as text with the reason, never a blank drawing; any other failure says what it was.
import { LAYOUT_LIMITS } from '@thoughtknot/core';

/** What a process gave back, as the host's `$.process.run` resolves it. */
export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Set when the host cut the output short at its limit. */
  isStdoutTruncated?: boolean;
}

/** Runs a command by its argument vector with `stdin` handed in, for at most `timeoutMs`; rejects when it cannot start. */
export type RunProcess = (argv: readonly string[], stdin: string, timeoutMs: number) => Promise<ProcessResult>;

/** Graphviz's answer: an SVG for each source, in order, or why there is none. */
export type Laid = { svgs: string[] } | { why: string };

/** Where the built render script sits in the mod. */
export const RENDER_SCRIPT = 'bin/render.mjs';

/** How long the layout may run: the core's time limit for each direction (spec §9), and five seconds to start node. */
export const LAYOUT_TIMEOUT_MS = 2 * LAYOUT_LIMITS.ms + 5000;

/** How long `node --version` may take, when asked whether node starts at all. */
export const VERSION_TIMEOUT_MS = 5000;

/** What the pane says when node cannot be started. */
export const NODE_MISSING =
  'Graphviz runs through Node.js, and node could not be started. Install Node.js 24 or later (nodejs.org), make sure ' +
  '`node` is on the path Claude Code starts with, and run /graph again. The graph is shown as text meanwhile.';

const SAID_MAX = 200;
const cut = (s: string) => (s.length > SAID_MAX ? `${s.slice(0, SAID_MAX - 1)}…` : s);
const firstLines = (s: string) => cut(s.trim().replace(/\s*\n\s*/g, ' '));
const messageOf = (err: unknown) => firstLines(err instanceof Error ? err.message : String(err));
/** What a spawn says when its program is not there: Node's and Bun's ENOENT, and a shell's words. */
const NOT_THERE = /ENOENT|not found|no such file|cannot find/i;

/**
 * After a run was refused, asks node itself whether it starts: a missing node is told apart from a layout that did not
 * finish, and from a host that runs no process at all, which is said in its own words, not as a missing node.
 */
async function whyRefused(run: RunProcess, err: unknown): Promise<string> {
  try {
    const version = await run(['node', '--version'], '', VERSION_TIMEOUT_MS);
    if (version.exitCode === 127) return NODE_MISSING;
  } catch (probe) {
    return NOT_THERE.test(messageOf(probe)) ? NODE_MISSING : `Could not run node: ${messageOf(probe)}`;
  }
  return `Graphviz did not finish: ${messageOf(err)}`;
}

/** Lays out each DOT source with the core's engine, run by node from the mod at `root`. */
export async function layOut(dots: string[], root: string, run: RunProcess): Promise<Laid> {
  let ran: ProcessResult;
  try {
    ran = await run(['node', `${root}/${RENDER_SCRIPT}`], JSON.stringify(dots), LAYOUT_TIMEOUT_MS);
  } catch (err) {
    return { why: await whyRefused(run, err) };
  }
  // a shell or env wrapper says "command not found" with 127
  if (ran.exitCode === 127) return { why: NODE_MISSING };
  if (ran.exitCode !== 0) return { why: `Graphviz failed: ${firstLines(ran.stderr) || `exit code ${ran.exitCode}`}` };
  if (ran.isStdoutTruncated) return { why: 'The drawing was too large to hand back from Graphviz.' };
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
