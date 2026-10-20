#!/usr/bin/env python3
"""Loads gql_profile from the vendored graph-spec library — reads GQL data blocks in the graph spec's document profile into a plain in-memory graph — no database — and computes the same canonical hash as the Grafeo checker. Never edit it here.

Usage:
  import gql_profile

Writes: nothing (library).

Category: Checks — graph model

WHY (7 Oct 2026): Standards/2026-10-07 The graph tooling becomes libraries in the graph-note repo.decision.md — the code lives
in the graph-note repo; the vault runs a read-only copy of a tagged release from vendor/graph-spec/python/gql_profile.py. This pointer
keeps every `import gql_profile` working unchanged. To change the library, change the repo, release it, and re-vendor with
graph-spec-vendor.py; see graph_spec_host.py for the vault's own settings.
"""
import graph_spec_host
graph_spec_host.use(__name__)
