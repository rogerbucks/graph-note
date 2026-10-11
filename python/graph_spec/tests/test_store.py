"""The store finds a node by its id in time that does not grow with the graph, as the JavaScript
store does (packages/graph-spec/src/reader/store.js), so a block of thousands of things is read in
time linear in them (editor spec §9: never freeze).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests
"""

import os
import sys
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.reader.lexer import ProfileError  # noqa: E402
from graphspec.reader.store import Store  # noqa: E402

GOOD = "// graph: g\n(a:T {name: 'A'})"
# an instant whose time in UTC falls before year 1, which Python's datetime cannot hold
BEFORE_YEAR_ONE = "// graph: g\n(b:T {at: DATETIME '0001-01-01T00:30:00+01:00'})"


def many_lines(n):
    """A data block of n things, one to a line."""
    return "// graph: g\n" + ",\n".join(f"(n{i}:T {{name: 'x'}})" for i in range(n))


def seconds(block):
    """The processor time a fresh store takes to apply the block: time spent waiting for the
    processor, which a loaded machine adds more of to a longer run, is not counted."""
    start = time.process_time()
    Store().apply(block)
    return time.process_time() - start


class ManyThings(unittest.TestCase):
    """A block of thousands of things is read in time linear in them."""

    def test_four_times_the_things_are_read_in_about_four_times_the_time(self):
        small, large = many_lines(1000), many_lines(4000)
        # timed against each other in the same run, never against a fixed time; processor time,
        # so waiting on a loaded machine is not counted, and the fastest of several runs, taken in
        # turn. Linear reading gives a ratio of about 4, quadratic about 16.
        t_small = t_large = float("inf")
        for _ in range(5):
            t_small = min(t_small, seconds(small))
            t_large = min(t_large, seconds(large))
        self.assertLess(
            t_large / t_small,
            1.5 * len(large) / len(small),
            f"1,000 things took {t_small * 1000:.0f} ms, 4,000 took {t_large * 1000:.0f} ms",
        )


class Whole(unittest.TestCase):
    """A block is applied whole or not at all, whatever stops its reading, as the JavaScript store
    applies it."""

    def test_a_block_that_fails_in_any_way_leaves_the_store_as_it_was(self):
        class Breaks(Store):
            def _apply(self, block):
                super()._apply(block)
                raise RuntimeError("broke after reading")

        store = Breaks()
        before = (dict(store.graphs), dict(store.schemas), dict(store.named))
        with self.assertRaises(RuntimeError):
            store.apply(GOOD)
        self.assertEqual((store.graphs, store.schemas, store.named), before)

    def test_an_instant_before_year_one_in_utc_is_refused_as_unreadable_at_its_line(self):
        store = Store()
        store.apply(GOOD)
        with self.assertRaises(ProfileError) as refused:
            store.apply(BEFORE_YEAR_ONE)
        self.assertEqual(refused.exception.line, 2)
        self.assertIn("0001-01-01T00:30:00+01:00", refused.exception.message)
        self.assertEqual([n["props"]["id"] for n in store.graphs["g"]["nodes"].values()], ["a"])


if __name__ == "__main__":
    unittest.main()
