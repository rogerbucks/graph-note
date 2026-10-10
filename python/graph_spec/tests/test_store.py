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

from graphspec.reader.store import Store  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
