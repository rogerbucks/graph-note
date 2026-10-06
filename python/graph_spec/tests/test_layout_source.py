"""The Graphviz source the drawing library writes is the source it wrote before it moved into this repository.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

The layout source, not the drawing: the source is the same on every machine, while the SVG depends on the
Graphviz installed. The cases and their recorded source are in layout_cases.json.
"""
import json, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))

import graph_svg

class LayoutSource(unittest.TestCase):
    def test_every_case(self):
        with open(os.path.join(HERE, 'layout_cases.json'), encoding='utf-8') as f: cases = json.load(f)
        for name, c in cases.items():
            with self.subTest(case=name):
                src, kinds, readings = graph_svg.dot_source([tuple(n) for n in c['nodes']], [tuple(e) for e in c['edges']], c['rankdir'])
                self.assertEqual(src, c['source'])
                self.assertEqual(kinds, c['kinds'])
                self.assertEqual(readings, c['readings'])

    def test_the_style_comes_from_beside_the_library(self):
        self.assertEqual(graph_svg.STYLE['font'], 'Helvetica')
        self.assertEqual(graph_svg.STYLE['directions'], ['LR', 'TB'])

if __name__ == '__main__': unittest.main()
