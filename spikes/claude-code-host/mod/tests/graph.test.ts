import { test, expect } from 'claude-code/testing'

import { NOTE, SVGS } from './fixtures.js'

test('the core reads, lays out and themes a graph, and the pane shows it as SVG or text', async ($, on) => {
  const ran: string[][] = []
  on('fs.read', async () => ({ value: NOTE }))
  on('process.run', async (_$, e) => {
    ran.push([...e.argv])
    expect(JSON.parse(e.init?.stdin ?? '[]')).toHaveLength(SVGS.length)
    return { value: { exitCode: 0, stdout: JSON.stringify(SVGS), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)

  const answer = await $.command.run({ command: 'graph', args: 'sample.md' } as never)
  expect(answer.text).toContain('reader: 4 things, 3 links')
  expect(ran[0]?.[0]).toBe('node')

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'graph-view', surface, component: 'Pane', requestId: 'graph', props: { title: 'Graph' } } as never)
    const [svg] = ((await ui.drawn()) as unknown as { children: unknown[] }).children as { type: string; props: { source: string; alt: string } }[]
    expect(svg?.type).toBe('Svg')
    expect(svg?.props.source.startsWith('<svg')).toBe(true)
    expect(svg?.props.source.length).toBeLessThan(131072)
    expect(svg?.props.alt).toBe('reader: 4 things, 3 links')
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'graph-view', surface: 'terminal', component: 'Pane', requestId: 'graph', props: { title: 'Graph' } } as never)
  expect(await ui.find({ type: 'Text', text: /large_reader —ANSWERS→ reader_question/ })).toBeDefined()
  await ui.unmount()
})

test("the core's own Graphviz cannot start in a mod: there is no WebAssembly and no code generation", async () => {
  expect(typeof (globalThis as Record<string, unknown>).WebAssembly).toBe('undefined')
  expect(() => new Function('return 1')).toThrow()
})
