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


def many_lines(n):
    """A data block of n things, one to a line."""
    return "// graph: g\n" + ",\n".join(f"(n{i}:T {{name: 'x'}})" for i in range(n))


def seconds(block):
    """The processor time a fresh store takes to apply the block: time spent waiting for the
    processor, which a loaded machine adds more of to a longer run, is not counted."""
    start = time.process_time()
    Store().apply(block)
    return time.process_time() - start


def props(store):
    """Each node's properties in graph g, in the order written."""
    return [n["props"] for n in store.graph("g")["nodes"].values()]


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


class SetId(unittest.TestCase):
    """A thing whose id is SET anew is found by its new id, and no longer by its old one, later
    in the same block — as the JavaScript store finds it."""

    def test_a_thing_is_found_by_the_id_set_earlier_in_its_block(self):
        s = Store()
        s.apply("// graph: g\n(a:T)")
        s.apply("// graph: g\nSET a.id = 'z', z.k = 1")
        self.assertEqual(props(s), [{"id": "z", "k": 1}])

    def test_a_thing_is_not_found_by_the_id_it_had_before(self):
        with self.assertRaisesRegex(ProfileError, "SET names old, which is no thing in graph g"):
            Store().apply("// graph: g\n(p:T {id: 'old'})\nSET p.id = 'new', old.k = 1")


if __name__ == "__main__":
    unittest.main()
