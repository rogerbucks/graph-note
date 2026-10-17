"""Editor spec §42, problem_codes: every problem the document profile reader raises carries a
stable code, the diagnostic code of the Language Server Protocol, the same from the Python and
the JavaScript libraries, so its message and fix can be translated and looked up. The codes are
one table, packages/graph-spec/src/reader/problem-codes.json, which the library itself never
reads: each raise site passes its code as a literal. The sources are scanned, so every raise site
passes a code the table gives Python, with the table's message and fix; and the blocks of
packages/graph-spec/test/problem-code-cases.json, which the JavaScript reader answers too
(packages/graph-spec/test/problem-codes.test.mjs), are refused with their codes.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_problem_codes
"""

import ast
import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
sys.path.insert(0, SRC)

from graphspec.reader.lexer import ProfileError  # noqa: E402
from graphspec.reader.store import Store  # noqa: E402
from graphspec.reader.to_gql import to_gql  # noqa: E402
from graphspec.rules.changes import read_change  # noqa: E402

GRAPH_SPEC = os.path.join(HERE, "..", "..", "..", "packages", "graph-spec")
with open(os.path.join(GRAPH_SPEC, "src", "reader", "problem-codes.json"), encoding="utf-8") as f:
    TABLE = json.load(f)
with open(os.path.join(GRAPH_SPEC, "test", "problem-code-cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)
BY_CODE = {c["code"]: c for c in TABLE["codes"]}
RAISERS = {"ProfileError", "IdNotTextError", "_refuse"}
PLACEHOLDER = re.compile(r"\{[a-z_]+\}")


def shape(template):
    """A table template with each {name} as {}, as written() gives the source's."""
    return PLACEHOLDER.sub("{}", template)


def pattern(template):
    """A table template as a pattern each problem it gives matches."""
    return re.compile(
        ".*".join(re.escape(s) for s in PLACEHOLDER.split(template)) + r"\Z", re.DOTALL
    )


def written(node, constants):
    """A message or fix as written in the source, its interpolations as {} (as '{}' where it is
    quoted by repr): a literal, or a constant of its module."""
    if isinstance(node, ast.Name):
        node = constants[node.id]
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        parts = []
        for v in node.values:
            if isinstance(v, ast.Constant):
                parts.append(v.value)
            else:
                parts.append("'{}'" if v.conversion == ord("r") else "{}")
        return "".join(parts)
    raise AssertionError(f"a message or fix written as a literal: {ast.dump(node)}")


def raise_sites():
    """Every place the Python library raises a ProfileError: where, its code, and its message and
    fix as written."""
    out = []
    for root, _, files in os.walk(SRC):
        for name in sorted(f for f in files if f.endswith(".py")):
            path = os.path.join(root, name)
            with open(path, encoding="utf-8") as f:
                tree = ast.parse(f.read(), path)
            constants = {
                t.id: n.value
                for n in tree.body
                if isinstance(n, ast.Assign)
                for t in n.targets
                if isinstance(t, ast.Name)
            }
            for n in ast.walk(tree):
                if not (
                    isinstance(n, ast.Call)
                    and isinstance(n.func, ast.Name)
                    and n.func.id in RAISERS
                ):
                    continue
                if isinstance(n.args[1], ast.Name) and n.args[1].id == "message":
                    continue  # _refuse's own raise: it passes on its caller's message and code
                code = next((k.value for k in n.keywords if k.arg == "code"), None)
                out.append(
                    {
                        "where": f"{os.path.relpath(path, SRC)}:{n.lineno}",
                        "code": code.value if isinstance(code, ast.Constant) else None,
                        "message": written(n.args[1], constants),
                        "fix": written(n.args[2], constants),
                    }
                )
    return out


def refusal(case):
    """The ProfileError a case is refused with, read as the case says, or None."""
    try:
        if case["via"] == "change":
            read_change(case["block"])
        elif case["via"] == "to_gql":
            to_gql(case["block"])
        else:
            Store().apply(case["block"])
    except ProfileError as e:
        return e
    return None


class ProblemCodes(unittest.TestCase):
    # a plain loop, never subTest: the tests-first replay counts a test by its own result

    def test_every_profile_error_raised_passes_a_code_the_table_gives_python(self):
        sites = raise_sites()
        self.assertGreater(len(sites), 40)
        bad = [
            f"{s['where']} {s['code']}"
            for s in sites
            if s["code"] not in BY_CODE or "py" not in BY_CODE[s["code"]]["libraries"]
        ]
        self.assertEqual(bad, [])

    def test_each_raise_site_writes_its_codes_message_and_fix_and_no_code_has_two(self):
        wrong, messages = [], {}
        for s in raise_sites():
            c = BY_CODE.get(s["code"])
            if c is None:
                continue
            if s["message"] != shape(c["message"]) or s["fix"] != shape(c["fix"]):
                wrong.append(f"{s['where']} {s['code']}: {s['message']}")
            messages.setdefault(s["code"], set()).add(f"{s['message']} — {s['fix']}")
        self.assertEqual(wrong, [])
        self.assertEqual([k for k, v in messages.items() if len(v) > 1], [])

    def test_every_code_the_table_gives_python_is_raised_somewhere(self):
        used = {s["code"] for s in raise_sites()}
        self.assertEqual(
            [
                c["code"]
                for c in TABLE["codes"]
                if "py" in c["libraries"] and c["code"] not in used
            ],
            [],
        )

    def test_every_case_is_refused_with_its_code_and_its_codes_message_and_fix(self):
        ours = [c for c in CASES["cases"] if "py" in BY_CODE[c["code"]]["libraries"]]
        self.assertGreaterEqual(len({c["code"] for c in ours}), 10)
        wrong = []
        for c in ours:
            e, t = refusal(c), BY_CODE[c["code"]]
            if (
                e is None
                or getattr(e, "code", None) != c["code"]
                or not pattern(t["message"]).match(e.message)
                or not pattern(t["fix"]).match(e.fix)
            ):
                got = f"{getattr(e, 'code', None)} {e.message} — {e.fix}" if e else "read"
                wrong.append(f"{c['name']}: {got}")
        self.assertEqual(wrong, [])


if __name__ == "__main__":
    unittest.main()
