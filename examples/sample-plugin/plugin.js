// A sample plug-in, kept outside the packages, as one a person writes would be (API-10). It imports nothing from
// ThoughtKnot: a host runs it apart, in a worker, and it reaches the host only through the points it names. CI runs it
// that way and holds what it adds to each point's contract (test/sample-plugin.test.js).

/** The plug-in: its manifest, with the version of each point it was built for, and what it adds. */
export default {
  id: 'example.sample',
  version: '1.0.0',
  api: '1.1',
  uses: ['sources@1.0', 'diagrams@1.0', 'commands@1.0', 'theme@1.0'],
  register(points) {
    points.sources.add({
      scheme: 'sample',
      title: 'Sample',
      read: (target) => ({
        text: `// graph: ${target}\n(start:Step {name: 'Start'}),\n(end:Step {name: 'End'}),\n(start)-[:THEN]->(end)`,
        classification: 'Public',
      }),
    });
    points.diagrams.add({
      type: 'example.sample.row',
      title: 'Row',
      // each thing a box in one row, each link an arrow between two boxes
      draw: ({ shape, space }) => {
        const width = Math.min(120, space.width / Math.max(1, shape.things.length));
        const at = new Map(shape.things.map((t, i) => [t.key, i * width]));
        return [
          ...shape.things.map((t) => ({
            kind: 'box',
            x: at.get(t.key),
            y: 0,
            width: width - 10,
            height: 40,
            label: t.text,
            thing: t.key,
          })),
          ...shape.links.map((l) => ({
            kind: 'line',
            points: [
              [at.get(l.from) + width - 10, 20],
              [at.get(l.to), 20],
            ],
            arrow: true,
          })),
        ];
      },
    });
    points.commands.add({ id: 'example.sample.hello', title: 'Say hello', run: () => {} });
    points.theme.add({ name: '--gn-plugin-example-sample-mark', light: '#1a1a1a', dark: '#f0f0f0' });
  },
};
