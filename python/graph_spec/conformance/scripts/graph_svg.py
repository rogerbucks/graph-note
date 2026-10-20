#!/usr/bin/env python3
"""Loads graph_svg from the vendored graph-spec library — lays out a graph with Graphviz and returns it as inline SVG that follows Obsidian's light and dark themes. Never edit it here.

Usage:
  import graph_svg

Writes: nothing (library).

Category: Checks — graph model

WHY (7 Oct 2026): Standards/2026-10-07 The graph tooling becomes libraries in the graph-note repo.decision.md — the code lives
in the graph-note repo; the vault runs a read-only copy of a tagged release from vendor/graph-spec/python/graph_svg.py. This pointer
keeps every `import graph_svg` working unchanged. To change the library, change the repo, release it, and re-vendor with
graph-spec-vendor.py; see graph_spec_host.py for the vault's own settings.
"""
import graph_spec_host
graph_spec_host.use(__name__)
