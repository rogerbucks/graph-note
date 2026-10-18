"""The modules only some functions need — Grafeo, PyYAML, lxml and rfc8785 — loaded on first
use, so the library imports with Python's standard library alone."""

from __future__ import annotations


class _Lazy:
    """A module loaded on first use — so this library imports with Python's standard library alone,
    and only the functions that need Grafeo, PyYAML, lxml or rfc8785 need them installed (portable
    checker P2, 5 Oct 2026)."""

    def __init__(self, name, missing=None):
        self._n, self._m, self._missing = name, None, missing

    def __getattr__(self, k):
        if self._m is None:
            import importlib

            try:
                self._m = importlib.import_module(self._n)
            except ImportError as e:
                if not self._missing:
                    raise
                raise ModuleNotFoundError(self._missing, name=self._n) from e
        return getattr(self._m, k)


# Grafeo is an optional extra, for database work only. A plain install reads, checks, joins and
# fills hashes without it (req:14.no-engine-install). A call that needs it says so
ENGINE_MISSING = (
    "this needs the engine, Grafeo, which a plain install leaves out — it is for database work "
    "only (queries, path search, a graph stored to query later): install graph-spec[grafeo]"
)

grafeo, yaml, etree, rfc8785 = (
    _Lazy("grafeo", ENGINE_MISSING),
    _Lazy("yaml"),
    _Lazy("lxml.etree"),
    _Lazy("rfc8785"),
)
