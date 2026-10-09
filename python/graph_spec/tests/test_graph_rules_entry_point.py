"""graph_rules, the plain-graph rules' entry point, keeps every name it had, as the object where
that name lives now, and imports with only src/ on sys.path (entry_point_contract.py).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests
"""

import unittest

from entry_point_contract import EntryPointContract


class GraphRulesEntryPoint(EntryPointContract, unittest.TestCase):
    FACADE = "graph_rules"
    TOUCH = ("World", "check", "jcs", "views", "SCHEMA_LABELS", "_word", "_iso")


if __name__ == "__main__":
    unittest.main()
