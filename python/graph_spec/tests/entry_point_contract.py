"""What every entry point keeps when its code moves into graphspec/: each name it had, as the same
object as where that name lives now, and an import that needs only src/ on sys.path.

Usage: mixed into each tests/test_<entry point>_entry_point.py, as
  class GqlProfileEntryPoint(EntryPointContract, unittest.TestCase): FACADE = "gql_profile"

entry_points.json records, for each entry point, every top-level name it had before the split
(dir() less dunders) and the module the name lives in now. A host — the vault — imports the entry
points by name with src/ alone on its path, and some of its scripts use private names, so none may
go missing.
"""

import importlib
import json
import os
import subprocess
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", "src"))
if SRC not in sys.path:
    sys.path.insert(0, SRC)

with open(os.path.join(HERE, "entry_points.json"), encoding="utf-8") as f:
    RECORDED = json.load(f)


class EntryPointContract:
    FACADE = ""  # the entry point's module name
    TOUCH = ()  # names a fresh interpreter reads from it

    def test_it_keeps_every_name_it_had(self):
        facade = importlib.import_module(self.FACADE)
        missing = [n for n in RECORDED[self.FACADE] if not hasattr(facade, n)]
        self.assertEqual(missing, [])

    def test_each_name_is_the_object_where_it_lives_now(self):
        facade = importlib.import_module(self.FACADE)
        differ = []
        for name, home_name in RECORDED[self.FACADE].items():
            home = importlib.import_module(home_name)
            value = getattr(facade, name)
            # an imported module (re, dt, …) lives in itself; anything else is an attribute of home
            if isinstance(value, types.ModuleType) and value.__name__ == home.__name__:
                expected = home
            else:
                expected = getattr(home, name)
            if value is not expected:
                differ.append(f"{name}: not the object in {home_name}")
        self.assertEqual(differ, [])

    def test_it_imports_in_a_fresh_interpreter_with_only_src_on_the_path(self):
        code = (
            "import sys\n"
            f"sys.path.insert(0, {SRC!r})\n"
            f"import {self.FACADE} as m\n"
            f"assert m.__file__.startswith({SRC!r}), m.__file__\n"
            f"for name in {list(self.TOUCH)!r}:\n"
            "    getattr(m, name)\n"
            "print('imported')\n"
        )
        # -I: no current directory, no user site and no PYTHON* variables on the path
        r = subprocess.run(
            [sys.executable, "-I", "-c", code],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(SRC),
            timeout=60,
        )
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "imported"), r.stderr)
