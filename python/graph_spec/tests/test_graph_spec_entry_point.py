"""graph_spec, the Grafeo library's entry point, keeps every name it had, as the object where that
name lives now, and imports with only src/ on sys.path (entry_point_contract.py).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests
"""

import unittest

from entry_point_contract import EntryPointContract


class GraphSpecEntryPoint(EntryPointContract, unittest.TestCase):
    FACADE = "graph_spec"
    TOUCH = ("parse", "join", "emit", "lint", "ViewServer", "PARSER", "CLASSIFICATION_NOTE", "_gp")


if __name__ == "__main__":
    unittest.main()
