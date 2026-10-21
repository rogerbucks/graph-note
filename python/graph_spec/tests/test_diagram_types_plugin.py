"""A diagram type a plug-in adds, chosen in a style graph (editor spec §15,
plugin_diagram_type_named). It is named under its plug-in's id, as `acme.charts.sankey`. Where no
plug-in draws it, the graph is drawn as a network, saying which plug-in draws it, as the core's
types.ts does. The shared case in type_cases.json holds the two to each other byte for byte."""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.style.diagram_types import diagram_for  # noqa: E402
from graphspec.style.words import plugin_type_of  # noqa: E402


class PluginDiagramTypes(unittest.TestCase):
    def test_a_plugin_type_names_its_plugin_and_its_own_word(self):
        self.assertEqual(
            plugin_type_of("acme.charts.sankey"), {"plugin": "acme.charts", "word": "sankey"}
        )
        self.assertEqual(plugin_type_of("acme-x.flow"), {"plugin": "acme-x", "word": "flow"})
        for name in (
            "tree",
            "acme",
            "Acme.charts.sankey",
            "acme.",
            ".sankey",
            "acme.charts.Sankey",
        ):
            self.assertIsNone(plugin_type_of(name), name)

    def test_one_nothing_here_draws_is_drawn_as_a_network_saying_why(self):
        diagram = {"type": "network", "plugin": "acme.charts.sankey", "at": None}
        self.assertEqual(
            diagram_for({}, [diagram]),
            {
                "drawn": "network",
                "plugin": {
                    "type": "acme.charts.sankey",
                    "plugin": "acme.charts",
                    "why": "the diagram type acme.charts.sankey comes from the plug-in "
                    "acme.charts, which is not here, so the graph is drawn as a network",
                },
            },
        )


if __name__ == "__main__":
    unittest.main()
