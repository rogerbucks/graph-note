#!/usr/bin/env python3
"""Loads graph_spec from the vendored graph-spec library — implements the graph spec's checkable rules — reading, joining (§21), projection (§18), process engine (§7, §16), certainty (§20), paths (§22) and judgements (§23), the dialect linter and the hash filler (§24 H1, H2) — for the conformance suite. Never edit it here.

Usage:
  import graph_spec

Writes: nothing (library).

Category: Checks — graph model

WHY (7 Oct 2026): Standards/2026-10-07 The graph tooling becomes libraries in the graph-note repo.decision.md — the code lives
in the graph-note repo; the vault runs a read-only copy of a tagged release from vendor/graph-spec/python/graph_spec.py. This pointer
keeps every `import graph_spec` working unchanged. To change the library, change the repo, release it, and re-vendor with
graph-spec-vendor.py; see graph_spec_host.py for the vault's own settings.
"""
import graph_spec_host
graph_spec_host.use(__name__)
