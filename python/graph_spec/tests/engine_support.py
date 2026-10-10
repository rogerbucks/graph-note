"""The reference engine, Grafeo, for the tests that need it: the route into the engine, and the
proof that the reader gives its answers. A plain install leaves Grafeo out
(req:14.no-engine-install), so where it is not installed — CI's python-no-engine job — those tests
are skipped and every other test runs. Where it must be — CI's python job, which sets
GRAPH_SPEC_ENGINE=required — they run whatever, so a missing engine fails them, never skips them.
"""

import os
import unittest

try:
    import grafeo  # noqa: F401

    HAVE_ENGINE = True
except ImportError:
    HAVE_ENGINE = False

REQUIRED = os.environ.get("GRAPH_SPEC_ENGINE") == "required"
WHY = "needs the engine, Grafeo, which a plain install leaves out (a dev install has it)"


def needs_engine(test):
    """A test, or a class of tests, that needs Grafeo: skipped without it, unless required."""
    return test if HAVE_ENGINE or REQUIRED else unittest.skip(WHY)(test)


def module_needs_engine():
    """Called from a module's setUpModule: every test in it needs Grafeo."""
    if not (HAVE_ENGINE or REQUIRED):
        raise unittest.SkipTest(WHY)
