"""The graph spec's conformance suite runs on this repository's own code (spec §51,
spec_conformance_in_repo; GS1). The suite and its cases came from the owner's vault and live in
conformance/. Every case's expected answers, the general properties and the safeguards must hold.
"""

import os
import re
import subprocess
import sys
import unittest

from engine_support import needs_engine

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, "..", "conformance", "scripts", "graph-spec-conformance.py")


@needs_engine
class ConformanceSuite(unittest.TestCase):
    def test_every_check_in_the_suite_passes_on_the_code_here(self):
        run = subprocess.run(
            [sys.executable, RUNNER, "--check"], capture_output=True, text=True, timeout=600
        )
        out = run.stdout + run.stderr
        fails = [line for line in out.splitlines() if line.startswith("FAIL")]
        self.assertEqual(fails, [], "\n".join(fails[:20]))
        self.assertEqual(run.returncode, 0, out[-2000:])
        total = re.search(r"(\d+) of (\d+) checks passed · (\d+) cases", out)
        self.assertIsNotNone(total, out[-2000:])
        self.assertEqual(total.group(1), total.group(2))
        self.assertEqual(total.group(3), "21")


if __name__ == "__main__":
    unittest.main()
