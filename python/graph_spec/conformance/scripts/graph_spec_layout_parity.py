#!/usr/bin/env python3
"""Checks that the plugin's layout source equals the vault's Python layout source, byte for byte, for every graph in every live note, both ways round.

Usage:
  ~/.venvs/arbux/bin/python zzSupport/_scripts/graph_spec_layout_parity.py              # exit status = graphs that differ (0 = all match)
  ~/.venvs/arbux/bin/python zzSupport/_scripts/graph_spec_layout_parity.py --summary    # one line, for the conformance suite

Writes: nothing (read-only).

Category: Checks — graph model

WHY (8 Oct 2026): requirement layout_byte_identical in Standards/Graph note editor requirements.md, proved by test_layout_parity —
"For every graph in the vault, the layout source from the core must be byte-identical to that from graph_svg.py." One locked style
means the drawing in Obsidian and the drawing a script puts in a note are laid out from the same Graphviz source, so they cannot
drift apart unseen. The plugin side is the vendored release's js/layout-source-node.cjs (from 0.2.0); the Python side is
graph_spec_draw.py's own world() and parts(), so what is compared is exactly what is drawn. Each run also tampers with one
source and requires the difference to be found, so a check that silently compares nothing cannot pass.
WHY suggested names (14 Oct 2026, 0.4.3): the plugin marks a box drawn under a suggested name, so the Python side passes them too.
Nudges are not compared here: the vendored harness lays out without them; graph-note's test_graph_svg_nudges proves the two agree.
"""
import os, sys, json, subprocess, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import graph_spec_host, graph_svg
VAULT = os.path.abspath(os.path.join(HERE, '..'))
NODE_ENTRY = os.path.join(graph_spec_host.VENDOR, 'js', 'layout-source-node.cjs')
DIRS = ('LR', 'TB')

def _load(name, file):
    sp = importlib.util.spec_from_file_location(name, os.path.join(HERE, file)); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m

def python_sources(draw, path, text, shared):
    """{graph: {'LR': source, 'TB': source}} for one note, as graph_spec_draw.py lays it out; graphs with nothing to draw left out."""
    w, schema_of, _, extras = draw.world(path, text, shared)
    out = {}
    for name in sorted(w.graphs):
        nodes, edges = draw.parts(w[name], schema_of(name))
        # the plugin's layout source marks the things drawn under a suggested name, so this side must too (14 Oct 2026).
        # Nudges are left out on both sides: the harness lays out without them.
        # The repository's own test_graph_svg_nudges proves the two agree on nudges.
        if nodes: out[name] = {d: graph_svg.dot_source(nodes, edges, d, suggested=extras[name]['suggested'])[0] for d in DIRS}
    return out

def js_sources(notes, shared):
    r = subprocess.run(['node', NODE_ENTRY], input=json.dumps({'notes': notes, 'shared': shared}), capture_output=True, text=True, timeout=300)
    if r.returncode != 0: raise SystemExit(f"layout-source-node.cjs failed: {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)

def differences(py, js):
    """[(note, graph, what differs)] between the two sides, for one note each."""
    out = []
    if isinstance(js, dict) and 'error' in js and not isinstance(js.get('error'), dict): return [('', '', f"the plugin could not read it: {js['error']}")]
    for g in sorted(set(py) | set(js)):
        a, b = py.get(g), js.get(g)
        if a is None or b is None:
            # a graph with nothing to draw may be left out by one side only if the other has no things either
            if (b if a is None else a) and 'node [' in str(b if a is None else a) and '" [label=' in str(b if a is None else a):
                out.append((g, 'drawn by ' + ('the plugin only' if a is None else 'Python only')))
            continue
        for d in DIRS:
            if a.get(d) != b.get(d):
                al, bl = (a.get(d) or '').split('\n'), (b.get(d) or '').split('\n')
                k = next((i for i, (x, y) in enumerate(zip(al, bl)) if x != y), min(len(al), len(bl)))
                out.append((g, f"{d} line {k + 1}: Python {al[k] if k < len(al) else '(ends)'!r} · plugin {bl[k] if k < len(bl) else '(ends)'!r}"))
    return out

def main():
    if not os.path.exists(NODE_ENTRY): print('layout parity: not checked — the vendored release has no layout-source-node.cjs (needs graph-spec 0.2.0 or later)'); return 1
    draw, cd = _load('graph_spec_draw', 'graph_spec_draw.py'), _load('check_docs', 'graph_spec_check_docs.py')
    docs = list(cd.documents()); shared = cd.schema_blocks(docs)
    notes = {os.path.join(VAULT, rel): open(os.path.join(VAULT, rel), encoding='utf-8').read() for rel, _, _ in docs}
    js = js_sources(notes, shared)
    graphs, bad, py_all = 0, [], {}
    for path, text in notes.items():
        py = py_all[path] = python_sources(draw, path, text, shared); graphs += len(py)
        bad += [(os.path.relpath(path, VAULT), g, why) for g, why in differences(py, js.get(path, {}))]
    # tamper: one changed character in one source must be found, or the comparison is not comparing
    path = next((p for p, s in py_all.items() if s), None)
    tampered = False
    if path:
        g = sorted(py_all[path])[0]; t = json.loads(json.dumps(js.get(path, {})))
        if g in t: t[g]['LR'] = t[g]['LR'].replace('digraph', 'digrap h', 1); tampered = bool(differences(py_all[path], t))
    line = f"layout parity: {graphs - len({(n, g) for n, g, _ in bad})} of {graphs} graphs in {len(notes)} notes match byte for byte, both ways round" + ('' if tampered else ' — BUT the tamper check found nothing, so the comparison is not working')
    if '--summary' in sys.argv: print(line)
    else:
        for n, g, why in bad: print(f"DIFFERS {n} · graph {g}: {why}")
        print(line)
    return len(bad) + (0 if tampered else 1)

if __name__ == '__main__':
    sys.exit(min(main(), 255))
