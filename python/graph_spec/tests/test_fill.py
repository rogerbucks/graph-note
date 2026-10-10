"""req:24.fill-reads-plain — "The hash and id filler must compute from the reader's reading": each
recipe's value — a basis hash, a judgement hash, a graph's state — held to the reference engine's,
and filled with Grafeo not installed.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_fill
"""

import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
sys.path.insert(0, SRC)
sys.path.insert(0, HERE)

import graph_spec as gs  # noqa: E402
from engine_support import needs_engine  # noqa: E402
from graphspec.engine import settings  # noqa: E402

# a data graph and the judgement graph that rests on it: the first generic case of the agreement
# test's judgements, whose hashes hold
with open(os.path.join(HERE, "agreement", "judgements.json"), encoding="utf-8") as f:
    DATA, JUDGEMENTS = ("\n".join(b) for b in json.load(f)["cases"][0]["blocks"])
RECIPES = {
    "STATE": {"load": ["#Data"], "state_of": "jud_d1"},
    "BASIS": {"load": ["#Data"], "graph": "jud_d1", "basis": "lisbon", "reads": "cost"},
    "JUDGEMENT": {"load": ["#Data", "#Judgements"], "graph": "jud_j1", "judgement": "d2"},
}
DOCUMENT = (
    f"## Data\n```gql\n{DATA}\n```\n## Judgements\n```gql\n{JUDGEMENTS}\n```\n"
    "```yaml\n# fill\n"
    + "".join(f"{k}: {json.dumps(r)}\n" for k, r in RECIPES.items())
    + "```\nmade against {{STATE}}, resting on {{BASIS}}, sealed {{JUDGEMENT}}\n"
)


class FillReadsPlain(unittest.TestCase):
    def test_a_document_s_hashes_are_filled_with_grafeo_not_installed(self):
        code = (
            "import sys\nsys.modules['grafeo'] = None\n"
            f"sys.path.insert(0, {SRC!r}); sys.path.insert(0, {HERE!r})\n"
            "import graph_spec as gs, test_fill as t\n"
            "text, values = gs.fill(t.DOCUMENT, '', '')\n"
            "print(sorted(values), values['JUDGEMENT'], '{{' not in text)\n"
        )
        r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), "['BASIS', 'JUDGEMENT', 'STATE'] 9acdc1efaa5f4955 True")

    @needs_engine
    def test_each_recipe_s_value_from_the_reader_s_reading_is_grafeo_s(self):
        old = settings.PARSER
        try:
            values = {}
            for parser in ("profile", "grafeo"):
                settings.PARSER = parser
                values[parser] = {k: gs.compute(r, DOCUMENT, "", "") for k, r in RECIPES.items()}
        finally:
            settings.PARSER = old
        self.assertEqual(values["profile"], values["grafeo"])
        self.assertEqual(values["profile"]["JUDGEMENT"], "9acdc1efaa5f4955")  # its content_hash


if __name__ == "__main__":
    unittest.main()
