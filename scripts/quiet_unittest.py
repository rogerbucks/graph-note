#!/usr/bin/env python3
"""A quiet runner for Python's unittest (spec section 13, quiet_test_run).

When every test passes it prints one line, `ok 126 tests`. For each failed test it prints:

    tests/test_x.py:12  Class.test_name
      error: AssertionError: 3 != 4     (the exception and its message's first line, cut short)
      at tests/test_x.py:14             (the innermost frame in the repository's own code)

and a last line, `FAIL 2 of 126 tests`. Whatever the tests print is dropped, pass or fail.

Run from the folder that holds `tests/`; `npm run test:ai:py` does that inside the library's
uv environment:

    python quiet_unittest.py                  every test `unittest discover -s tests` finds
    python quiet_unittest.py test_x.py ...    only these test files in tests/
"""

import contextlib
import inspect
import io
import os
import re
import sys
import traceback
import unittest

CUT = 200
SKIPPED_FRAMES = ("site-packages", ".venv", "unittest", "<frozen")


def shorten(text: str, limit: int = CUT) -> str:
    """The text on one line, cut to at most `limit` characters, with an ellipsis if cut."""
    one = " ".join(text.split())
    return one if len(one) <= limit else one[:limit] + "…"


def relative(path: str) -> str:
    """The path relative to the working folder."""
    return os.path.relpath(path)


def inside_repository(path: str) -> bool:
    """True for a file in the working folder that is not a dependency or part of unittest."""
    return os.path.abspath(path).startswith(os.getcwd() + os.sep) and not any(
        part in os.path.abspath(path).split(os.sep) for part in SKIPPED_FRAMES
    )


def first_frame(tb) -> str | None:
    """The innermost frame of a traceback that is in the repository's own code, as `file:line`."""
    found = None
    for frame in traceback.extract_tb(tb):
        if inside_repository(frame.filename):
            found = f"{relative(frame.filename)}:{frame.lineno}"
    return found


def where(test: unittest.TestCase) -> str:
    """The file and line where the test method is defined."""
    method = getattr(type(test), test._testMethodName, None)
    try:
        file = inspect.getsourcefile(method) or inspect.getfile(type(test))
        line = inspect.getsourcelines(method)[1]
        return f"{relative(file)}:{line}"
    except (TypeError, OSError):
        return "?"


class Quiet(unittest.TestResult):
    """Counts the tests and keeps a short account of each one that failed."""

    def __init__(self) -> None:
        super().__init__()
        self.total = 0
        self.skipped_count = 0
        self.entries: list[str] = []
        self.failed: set[str] = set()

    def startTest(self, test) -> None:  # noqa: N802 - the name unittest calls
        super().startTest(test)
        self.total += 1

    def addSkip(self, test, reason) -> None:  # noqa: N802 - the name unittest calls
        super().addSkip(test, reason)
        self.skipped_count += 1

    def _note_import_failure(self, value) -> None:
        """A test file that could not be imported: the wrapped exception's last line and place."""
        message = str(value)
        module = re.search(r"Failed to import test module: (\S+)", message)
        error = [line for line in message.splitlines() if line.strip()][-1]
        frames = [
            f"{relative(path)}:{number}"
            for path, number in re.findall(r'File "([^"]+)", line (\d+)', message)
            if inside_repository(path)
        ]
        lines = [f"{frames[0] if frames else '?'}  import {module.group(1) if module else '?'}"]
        lines.append(f"  error: {shorten(error)}")
        if len(frames) > 1 and frames[-1] != frames[0]:
            lines.append(f"  at {frames[-1]}")
        self.entries.append("\n".join(lines))

    def _note(self, test, err, subtest=None) -> None:
        self.failed.add(test.id())
        kind, value, tb = err
        if type(test).__name__ == "_FailedTest" and isinstance(value, ImportError):
            return self._note_import_failure(value)
        frame = first_frame(tb)
        if not hasattr(test, "_testMethodName"):  # a setUpClass that failed is not a test method
            title, place = test.id(), frame or "?"
        else:
            title, place = f"{type(test).__name__}.{test._testMethodName}", where(test)
            if subtest is not None:  # its parameters, as unittest names them: (i=2)
                title += f" {subtest._subDescription()}"
        lines = [f"{place}  {title}"]
        error = traceback.format_exception_only(kind, value)[0].splitlines()[0]
        lines.append(f"  error: {shorten(error)}")
        if frame:
            lines.append(f"  at {frame}")
        self.entries.append("\n".join(lines))

    def addSubTest(self, test, subtest, err) -> None:  # noqa: N802 - the name unittest calls
        super().addSubTest(test, subtest, err)
        if err is not None:
            self._note(test, err, subtest)

    def addError(self, test, err) -> None:  # noqa: N802 - the name unittest calls
        super().addError(test, err)
        self._note(test, err)

    def addFailure(self, test, err) -> None:  # noqa: N802 - the name unittest calls
        super().addFailure(test, err)
        self._note(test, err)

    def addUnexpectedSuccess(self, test) -> None:  # noqa: N802 - the name unittest calls
        super().addUnexpectedSuccess(test)
        self.failed.add(test.id())
        self.entries.append(
            f"{where(test)}  {test.id().split('.', 1)[-1]}\n  error: unexpected success"
        )


def load(files: list[str]) -> unittest.TestSuite:
    """The tests in `tests/`: all of them, or only those in the named files."""
    loader = unittest.TestLoader()
    top = os.path.abspath("tests")
    if top not in sys.path:
        sys.path.insert(0, top)
    if not files:
        return loader.discover("tests", top_level_dir=top)
    suite = unittest.TestSuite()
    for file in files:
        suite.addTests(loader.discover("tests", pattern=os.path.basename(file), top_level_dir=top))
    return suite


def main(files: list[str]) -> int:
    """Runs the tests quietly and prints the result; the exit status is 0 only when all passed."""
    result = Quiet()
    sink = io.StringIO()
    with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
        load(files).run(result)
    for entry in result.entries:
        print(entry)
    failed = len(result.failed)
    if failed:
        print(f"FAIL {failed} of {result.total} tests")
        return 1
    skipped = f", {result.skipped_count} skipped" if result.skipped_count else ""
    print(f"ok {result.total} tests{skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
