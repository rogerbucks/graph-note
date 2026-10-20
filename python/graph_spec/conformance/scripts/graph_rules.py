#!/usr/bin/env python3
"""Loads graph_rules from the vendored graph-spec library — runs the graph spec's checks on a plain in-memory graph — no database — for any system that can run Python: types (§5), the flat projection (§18), certainty (§20), paths (§22), completeness (§25), judgements (§23) and servings (§24). Never edit it here.

Usage:
  import graph_rules

Writes: nothing (library).

Category: Checks — graph model

WHY (7 Oct 2026): Standards/2026-10-07 The graph tooling becomes libraries in the graph-note repo.decision.md — the code lives
in the graph-note repo; the vault runs a read-only copy of a tagged release from vendor/graph-spec/python/graph_rules.py. This pointer
keeps every `import graph_rules` working unchanged. To change the library, change the repo, release it, and re-vendor with
graph-spec-vendor.py; see graph_spec_host.py for the vault's own settings.
"""
import graph_spec_host
graph_spec_host.use(__name__)
