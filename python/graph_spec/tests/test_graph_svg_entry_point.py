"""graph_svg, the drawing's entry point, keeps every name it had and imports with only src/ on
sys.path (entry_point_contract.py). Its code stays in the one module, so each name lives there.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests
"""

import unittest

from entry_point_contract import EntryPointContract


class GraphSvgEntryPoint(EntryPointContract, unittest.TestCase):
    FACADE = "graph_svg"
    TOUCH = ("available", "render", "dot_source", "STYLE", "_pick")


if __name__ == "__main__":
    unittest.main()
