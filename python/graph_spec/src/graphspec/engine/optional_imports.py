"""The modules only some functions need — Grafeo, PyYAML, lxml and rfc8785 — loaded on first
use, so the library imports with Python's standard library alone."""

from __future__ import annotations


class _Lazy:
    """A module loaded on first use — so this library imports with Python's standard library alone,
    and only the functions that need Grafeo, PyYAML, lxml or rfc8785 need them installed (portable
    checker P2, 5 Oct 2026)."""

    def __init__(self, name):
        self._n, self._m = name, None

    def __getattr__(self, k):
        if self._m is None:
            import importlib

            self._m = importlib.import_module(self._n)
        return getattr(self._m, k)


grafeo, yaml, etree, rfc8785 = (
    _Lazy("grafeo"),
    _Lazy("yaml"),
    _Lazy("lxml.etree"),
    _Lazy("rfc8785"),
)
