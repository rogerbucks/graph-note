"""gql_profile, the document profile reader's entry point, keeps every name it had, as the object
where that name lives now, and imports with only src/ on sys.path (entry_point_contract.py).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests
"""

import unittest

from entry_point_contract import EntryPointContract


class GqlProfileEntryPoint(EntryPointContract, unittest.TestCase):
    FACADE = "gql_profile"
    TOUCH = ("Store", "ProfileError", "to_gql", "read_for_drawing", "canon", "_bare_names", "UTC")


if __name__ == "__main__":
    unittest.main()
