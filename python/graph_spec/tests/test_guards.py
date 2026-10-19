"""Editor spec §13, guards_never_run: a guard in a shared note that calls a function, reads an
attribute or imports a module is refused. The process engine, the SCXML reader and the join's
constraint check refuse it alike.
The JavaScript checker reads guards the same way (packages/graph-spec/src/joins/validate.js).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_guards
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.joining.breaches import guard_holds  # noqa: E402
from graphspec.engine.process.machine import Machine  # noqa: E402
from graphspec.engine.process.scxml import ScxmlReader  # noqa: E402

# Each would run the note author's code if a guard were evaluated as Python.
HOSTILE = [
    "__import__('os').getpid() > 0",
    "score.__class__ = score.__class__",
    "[x for x in (1,)] = [1]",
    "score > 600; print(1)",
    "lambda: 1",
    "open('/etc/passwd')",
]
CTX = {"score": 700, "balance": 0, "status": "open"}


def scxml_cond(c, ctx):
    """An SCXML cond held by the reader, without a document."""
    return ScxmlReader.cond(None, c, ctx)


class GuardsNeverRun(unittest.TestCase):
    def test_a_guard_that_calls_or_imports_is_refused(self):
        for g in HOSTILE:
            for name, holds in [
                ("machine", Machine.holds),
                ("join", guard_holds),
                ("scxml", scxml_cond),
            ]:
                with self.subTest(guard=g, reader=name):
                    with self.assertRaisesRegex(ValueError, "refused"):
                        holds(g, CTX)

    def test_comparisons_joined_by_and_or_not_still_hold(self):
        cases = [
            ("score > 600", True),
            ("balance = 0", True),
            ("balance == 0", True),
            ("balance != 0", False),
            ("score >= 700 and balance <= 0", True),
            ("score < 600 or balance = 0", True),
            ("score > 600 and not balance = 0", False),
            ("not (score > 600 or balance = 1)", False),
            ("status = 'open'", True),
            ('status = "closed"', False),
            ("True", True),
            ("score > -1.5", True),
        ]
        for g, want in cases:
            with self.subTest(guard=g):
                self.assertIs(bool(Machine.holds(g, CTX)), want)
                self.assertIs(bool(guard_holds(g, CTX)), want)

    def test_scxml_conds_read_their_ecmascript_operators(self):
        cases = [
            ("score > 600 && balance === 0", True),
            ("score > 600 && !balance === 0", False),
            ("score < 600 || balance === 0", True),
            ("balance !== 0", False),
        ]
        for c, want in cases:
            with self.subTest(cond=c):
                self.assertIs(bool(scxml_cond(c, CTX)), want)

    def test_an_unknown_name_is_named(self):
        with self.assertRaisesRegex(NameError, "'missing'"):
            Machine.holds("missing > 1", CTX)


if __name__ == "__main__":
    unittest.main()
