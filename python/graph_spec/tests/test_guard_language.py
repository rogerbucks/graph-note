"""Editor spec §51, spec_guard_language (GS4): a process guard is written in the small language
requirements/guard-language.md defines. It has no calls, no input or output and no clock, and the
engine refuses anything else. The cases are packages/graph-spec/test/guard-cases.json, which the
JavaScript checker answers too (packages/graph-spec/test/guards.test.mjs). Every reader of a guard
answers alike: the process engine, the SCXML reader and the join's check.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_guard_language
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine import guards  # noqa: E402
from graphspec.engine.joining.breaches import guard_holds  # noqa: E402
from graphspec.engine.process.machine import Machine  # noqa: E402
from graphspec.engine.process.scxml import ScxmlReader  # noqa: E402

CASES = os.path.join(HERE, "..", "..", "..", "packages", "graph-spec", "test", "guard-cases.json")
with open(CASES, encoding="utf-8") as f:
    TABLE = json.load(f)
READERS = [
    ("machine", Machine.holds),
    ("join", guard_holds),
    ("scxml", lambda c, ctx: ScxmlReader.cond(None, c, ctx)),
]


class GuardLanguage(unittest.TestCase):
    def test_every_case_is_answered_as_the_table_says_by_every_reader(self):
        for case in TABLE["cases"]:
            ctx = case.get("ctx", TABLE["ctx"])
            for name, holds in READERS:
                with self.subTest(guard=case["guard"], reader=name):
                    if "holds" in case:
                        self.assertIs(bool(holds(case["guard"], ctx)), case["holds"])
                    elif "refused" in case:
                        with self.assertRaisesRegex(ValueError, "^refused"):
                            holds(case["guard"], ctx)
                    else:
                        with self.assertRaisesRegex(NameError, "is not defined"):
                            holds(case["guard"], ctx)

    def test_the_library_states_the_limits_the_table_gives(self):
        self.assertEqual(guards.LIMITS, TABLE["limits"])

    def test_a_guard_past_a_limit_is_refused_never_run_out_of_stack(self):
        most, deep = TABLE["limits"]["chars"], TABLE["limits"]["nesting"]
        long = "score > 1" + " and score > 1" * ((most - 9) // 14)
        self.assertLessEqual(len(long), most)
        self.assertTrue(guards.holds(long, TABLE["ctx"]))
        self.assertTrue(guards.holds("(" * deep + "True" + ")" * deep, TABLE["ctx"]))
        for g in [
            long + " and True" * 10,
            "(" * (deep + 1) + "True" + ")" * (deep + 1),
            "not " * (deep + 1) + "False",
            "(" * 5000 + "True" + ")" * 5000,
        ]:
            with self.subTest(guard=g[:30]):
                with self.assertRaisesRegex(ValueError, "^refused"):
                    guards.holds(g, TABLE["ctx"])

    def test_an_allowed_guard_reads_nothing_outside_the_context_it_is_given(self):
        # a name the context does not hold as its own is unknown, whatever the language has
        for g in ["__builtins__", "__class__ == 1", "globals", "print"]:
            with self.subTest(guard=g):
                with self.assertRaisesRegex(NameError, "is not defined"):
                    guards.holds(g, {})


if __name__ == "__main__":
    unittest.main()
