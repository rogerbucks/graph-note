// A diagram type a plug-in adds, chosen in a style graph (editor spec §15, plugin_diagram_type_named). It is named
// under its plug-in's id, `acme.charts.sankey`. Where no plug-in draws it, the graph is drawn as a network, saying which
// plug-in draws it. The core and the Python library read it alike (python/graph_spec/tests/type_cases.json).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { diagramFor, pluginTypeOf } from '../src/types.ts';

const GRAPH = "// graph: trip\n(paris:City {name: 'Paris'}),\n(rome:City {name: 'Rome'}),\n(paris)-[:TO]->(rome)";
const styled = (...lines) => {
  const texts = [GRAPH, ['// graph: trip_style · STYLE trip', ...lines].join('\n')];
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, 'trip', reading);
  return { style, problems, drawing: reading.graphs.get('trip'), g: reading.world.trip };
};

describe('a diagram type a plug-in adds (plugin_diagram_type_named)', () => {
  test('one named under a plug-in’s id is read with no problem, and drawn as a network where no plug-in draws it', () => {
    const { style, problems, drawing, g } = styled("(d1:Diagram {type: 'acme.charts.sankey'})");
    assert.deepEqual(problems, []);
    assert.deepEqual(diagramFor(drawing, style, g), {
      drawn: 'network',
      plugin: {
        type: 'acme.charts.sankey',
        plugin: 'acme.charts',
        why: 'the diagram type acme.charts.sankey comes from the plug-in acme.charts, which is not here, so the graph is drawn as a network',
      },
    });
  });

  test('a view may choose one of its own, over the whole graph’s', () => {
    const { style, drawing, g } = styled(
      "(d1:Diagram {type: 'tree'}),",
      "(d2:Diagram {type: 'acme-x.flow', view: 'v'})",
    );
    assert.equal(diagramFor(drawing, style, g, 'v').plugin.plugin, 'acme-x');
    assert.equal(diagramFor(drawing, style, g).plugin, undefined);
  });

  test('a name that is not under a plug-in’s id is still not a diagram type', () => {
    for (const written of ['sankey', 'Acme.charts.sankey', 'acme.', '.sankey', 'acme.charts.Sankey'])
      assert.match(
        styled(`(d1:Diagram {type: '${written}'})`).problems[0]?.message ?? '',
        /is not a diagram type/,
        written,
      );
  });

  test('the plug-in’s id is all before the last dot, and the type’s own word after it', () => {
    assert.deepEqual(pluginTypeOf('acme.charts.sankey'), { plugin: 'acme.charts', word: 'sankey' });
    assert.equal(pluginTypeOf('acme'), null);
    assert.equal(pluginTypeOf('tree'), null);
  });
});
