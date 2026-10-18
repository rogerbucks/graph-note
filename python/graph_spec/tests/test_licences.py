"""Every package the Python library installs carries a licence on the repository's allow-list.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

Spec §13: libraries that are not bundled into a plugin release should still carry an allowed
licence. The packages are the ones uv.lock pins; each licence is read from the installed package's
own metadata.
"""

import importlib.metadata as md
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from engine_support import needs_engine  # noqa: E402

ALLOWED = {"MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "Zlib"}
CLASSIFIERS = {
    "License :: OSI Approved :: MIT License": "MIT",
    "License :: OSI Approved :: Apache Software License": "Apache-2.0",
    "License :: OSI Approved :: ISC License (ISCL)": "ISC",
    "License :: OSI Approved :: Zlib/libpng License": "Zlib",
}


def locked_packages():
    """(name, version) of every package uv.lock pins, but the library itself."""
    with open(os.path.join(HERE, "..", "uv.lock"), encoding="utf-8") as f:
        text = f.read()
    out = []
    for entry in text.split("[[package]]")[1:]:
        name = re.search(r'^name = "([^"]+)"', entry, re.M).group(1)
        version = re.search(r'^version = "([^"]+)"', entry, re.M).group(1)
        if "source = { virtual" not in entry and "source = { editable" not in entry:
            out.append((name, version))
    return out


def licences(name):
    """The licences a package declares: its SPDX expression, else its licence classifiers."""
    meta = md.metadata(name)
    expr = meta.get("License-Expression")
    if expr:
        return {expr}
    found = {
        CLASSIFIERS.get(c, c)
        for c in meta.get_all("Classifier") or []
        if c.startswith("License ::")
    }
    if not found and meta.get("License") in ALLOWED:
        found = {meta.get("License")}
    return found


# Every locked package, the engine and the dev tools among them. That is what a dev install has,
# as CI's python job runs it. A plain install leaves them out.
@needs_engine
class Licences(unittest.TestCase):
    def test_there_are_packages_to_check(self):
        self.assertGreater(len(locked_packages()), 0)

    def test_every_locked_package_is_installed_at_its_pinned_version(self):
        for name, version in locked_packages():
            with self.subTest(package=name):
                self.assertEqual(md.version(name), version)

    def test_every_locked_package_carries_an_allowed_licence(self):
        for name, _ in locked_packages():
            with self.subTest(package=name):
                found = licences(name)
                self.assertTrue(found, f"{name} declares no licence")
                self.assertTrue(found <= ALLOWED, f"{name}: {sorted(found)}")


if __name__ == "__main__":
    unittest.main()
