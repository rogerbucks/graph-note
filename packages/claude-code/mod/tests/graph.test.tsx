// /graph in the mod's own environment (spec §10, a Claude Code host): the core reads, lays out and themes the test
// vault's sample note, and the pane shows it as SVG where a surface draws one and as text on the terminal; when node is
// missing, the pane says so and shows the graph as text, never a blank drawing.
import { test, expect } from 'claude-code/testing';

import { NOTE, SVGS } from './fixtures.js';

const ran = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
});
const SURFACES = ['desktop', 'vscode', 'mobile'] as const;
const mount = ($: any, surface: string) =>
  $.ui.mount({
    plugin: 'graph-note',
    surface,
    component: 'Pane',
    requestId: 'graph',
    props: { title: 'Graph' },
  } as never);

test('the sample note is drawn as SVG in the light or dark the app shows, and as text on the terminal', async ($, on) => {
  const argvs: string[][] = [];
  on('fs.read', async () => ({ value: NOTE }));
  // the terminal's theme setting says dark: the drawing must not take it, since the desktop app may be light
  on('config.list', async () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never);
  on('process.run', async (_$, e) => {
    argvs.push([...e.argv]);
    expect(JSON.parse(e.init?.stdin ?? '[]')).toHaveLength(SVGS.length);
    return ran(JSON.stringify(SVGS));
  });
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never);

  const answer = await $.command.run({ command: 'graph', args: '"test-vault/Sample graph note.md"' } as never);
  expect(answer.text).toMatch(/^reader: \d+ things, \d+ links$/);
  expect(argvs[0]?.[0]).toBe('node');
  expect(argvs[0]?.[1]).toMatch(/\/bin\/render\.mjs$/);

  for (const surface of SURFACES) {
    const ui = await mount($, surface);
    const svg = (await ui.drawn()) as unknown as { type: string; props: { source: string; alt: string } };
    expect(svg.type).toBe('Svg');
    expect(svg.props.source).toMatch(/^<svg [^>]*background:var\(--gn-page\)/);
    expect(svg.props.source).toMatch(/<style>[^<]*@media \(prefers-color-scheme: dark\)/);
    expect(svg.props.source).not.toMatch(/var\(--(color|text)-/);
    expect(svg.props.alt).toBe(answer.text);
    await ui.unmount();
  }
  const ui = await mount($, 'terminal');
  expect(await ui.find({ type: 'Text', text: /cannot draw pictures/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /large_reader —answers→ reader_question/i })).toBeDefined();
  await ui.unmount();
});

test('the layout is given the time the host package names, and node --version a short one', async ($, on) => {
  const timeouts: (number | undefined)[] = [];
  on('fs.read', async () => ({ value: NOTE }));
  on('config.list', async () => ({ value: [] }) as never);
  on('process.run', async (_$, e) => {
    timeouts.push(e.init?.timeoutMs);
    return { deny: 'spawn node ENOENT' } as never;
  });
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never);
  await $.command.run({ command: 'graph', args: 'test-vault/Sample graph note.md' } as never);
  expect(timeouts).toEqual([15000, 5000]);
});

test('when node is missing, the pane says so and shows the graph as text on every surface', async ($, on) => {
  on('fs.read', async () => ({ value: NOTE }));
  on('config.list', async () => ({ value: [] }) as never);
  // the call rejects, as the host's does when node cannot start (a hook that throws is skipped, so it denies)
  on('process.run', async () => ({ deny: 'spawn node ENOENT' }) as never);
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never);

  const answer = await $.command.run({ command: 'graph', args: 'test-vault/Sample graph note.md' } as never);
  expect(answer.text).toMatch(/node could not be started/);
  for (const surface of [...SURFACES, 'terminal'] as const) {
    const ui = await mount($, surface);
    expect(await ui.find({ type: 'Text', text: /Install Node\.js/ })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /large_reader —answers→ reader_question/i })).toBeDefined();
    await ui.unmount();
  }
});

test('/graph with no note says how to name one', async ($) => {
  const answer = await $.command.run({ command: 'graph', args: '  ' } as never);
  expect(answer.text).toMatch(/^Name a note to draw/);
});

test("the core's own Graphviz cannot start in a mod: there is no WebAssembly and no code generation", async () => {
  expect(typeof (globalThis as Record<string, unknown>).WebAssembly).toBe('undefined');
  expect(() => new Function('return 1')).toThrow();
});
