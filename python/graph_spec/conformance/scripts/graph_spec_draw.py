#!/usr/bin/env python3
"""Draws the graph in a note as a Mermaid diagram — each relationship labelled with its declared reading, a legend underneath — and, with --write, places it in the note's Drawing section.

Usage:
  python3 zzSupport/_scripts/graph_spec_draw.py "Standards/How to write a graph note.md"           # print the drawing; write nothing
  python3 zzSupport/_scripts/graph_spec_draw.py --write "Standards/How to write a graph note.md"   # place it in the note, between its drawing markers

Writes: with --write, only the regions between <!-- graph-drawing:start --> and <!-- graph-drawing:end --> in the named note
(one added at the end, under "## Drawing", if the note has none), after a backup to ~/zzBackups/notes/; nothing otherwise.
Each region draws the graph as built by the gql blocks above it, so a note that grows its graph in steps can show a drawing
after each step; a single region at the end draws the whole graph.

Category: Views — graph model

WHY (6 Oct 2026): Roger asked for a guide to writing a graph note and turning it into a diagram with a prompt —
[[How to write a graph note]]. The prompt "Draw the graph in <note>" runs this script, so the drawing is made by code, the
same way every time, never by a model's reading of the note. Standard library only (gql_profile.py, graph_rules.py, graph_svg.py), so it
runs under macOS's own Python too. The layout is Graphviz's (graph_svg.py says why); without Graphviz it falls back to Mermaid. A graph that fails its checks is still drawn, with the failures stated above it — it
never quietly disappears. A graph that names a shared schema (§5) is typed with the vault's schema documents.
The drawing is a derivative: edit the graph, then draw again — never edit the region by hand.
WHY regions draw what is above them (6 Oct 2026): Roger asked for the guide's example to build from simple to complex, so
each step needs its own picture of the graph so far. A region at the end still draws everything, so no note changes meaning.
WHY suggested names, nudges and direction (14 Oct 2026, graph-spec 0.4.3): a thing written without a name is drawn under its
suggested name, dashed and labelled (unnamed_drawn_suggested), and a graph's style graph places it as the plugin does — its nudges and
the direction a direction nudge sets (python_honours_nudges). Warnings and style problems are stated above the drawing, never dropped.
Tested by graph-spec-draw-test.py.
"""
import os, re, sys, shutil, importlib.util, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gql_profile as gp, graph_rules as gr, graph_svg
VAULT = os.path.abspath(os.path.join(HERE, '..'))
START, END = '<!-- graph-drawing:start', '<!-- graph-drawing:end -->'

def _docs():
    sp = importlib.util.spec_from_file_location('check_docs', os.path.join(HERE, 'graph_spec_check_docs.py')); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m

def caption(g, i):
    """A box's text: the node's name (or title, or text), then its label in italics."""
    labels, p = g.nodes[i][0], g.p(i)
    t = next((p[k] for k in ('name', 'title', 'text', 'label') if isinstance(p.get(k), str) and p[k]), i)
    kinds = ' · '.join(sorted(l for l in labels if l not in gr.SCHEMA_LABELS))
    return (f"{t}<br/><i>{kinds}</i>" if kinds else t).replace('"', "'")

def mermaid(g, shared):
    ids = sorted(i for i, (l, _) in g.nodes.items() if not l & gr.SCHEMA_LABELS)
    var = {i: f"n{k}" for k, i in enumerate(ids)}; R = gr.readings(g, shared)
    lines = ['flowchart LR'] + [f'    {var[i]}["{caption(g, i)}"]' for i in ids]
    lines += sorted(f'    {var[s]} -->|"{gr._word(R, t)}"| {var[d]}' for s, t, d, _ in g.edges if s in var and d in var)
    return '\n'.join(lines), len(ids), sum(1 for s, _, d, _ in g.edges if s in var and d in var)

def parts(g, shared):
    """The things and links a drawing is laid out from — (nodes, edges) as graph_svg takes them. Shared with the layout
    parity check (graph_spec_layout_parity.py), so what is compared is what is drawn."""
    ids = [i for i, (l, _) in g.nodes.items() if not l & gr.SCHEMA_LABELS]; R = gr.readings(g, shared)   # in the note's order: colours follow first appearance
    def text(i):
        p = g.p(i); return next((p[k] for k in ('name', 'title', 'text', 'label') if isinstance(p.get(k), str) and p[k]), i)
    nodes = [(i, ' · '.join(sorted(l for l in g.nodes[i][0] if l not in gr.SCHEMA_LABELS)), text(i)) for i in ids]
    edges = [(s, gr._word(R, t), d) for s, t, d, _ in g.edges if s in ids and d in ids]
    return nodes, edges

def svg(g, shared, extra=None):
    """The graph laid out by Graphviz, as inline SVG inside a .mermaid box so the Mermaid Zoom plugin gives it zoom and fullscreen.
    extra: what world() gives for the graph — the things drawn under a suggested name, and the nudges and direction of its style."""
    nodes, edges = parts(g, shared); x = extra or {}
    pic = graph_svg.render(nodes, edges, suggested=x.get('suggested', set()), nudges=x.get('nudges', []), direction=x.get('direction'))
    return f'<div class="mermaid graph-svg">\n{pic}\n</div>', len(nodes), len(edges)

def note_schemas(path):
    """Each graph's own schema as the whole note declares it — so a drawing above a locked graph's schema (written last, §5)
    still reads its relationships in the declared words. {graph: Graph holding its ElementTypes}."""
    store = gp.Store()
    for b in re.findall(r"```gql\n(.*?)\n```", open(path, encoding='utf-8').read(), re.S):
        try:
            if gp.header(b)[1] == 'data': store.apply(b)
        except gp.ProfileError: pass
    w = gr.World.from_store(store)
    return {name: w[name] for name in w.graphs if w[name].labelled('ElementType')}

def world(path, text, shared_blocks=None):
    """The note's graphs as drawn: the vault's shared schemas, then the note's data blocks, in order, each block that cannot be
    read drawn in part (gql_profile.read_for_drawing). Returns (World, the schema each graph is typed by, [(graph, problem)] for
    blocks not read whole, and for each graph {suggested, nudges, direction, notes}: the things read under a suggested name, the
    nudges and direction of its style graph (gql_profile.read_style), and the warnings and style problems to state above it).
    Shared with the layout parity check."""
    blocks = re.findall(r"```gql\n(.*?)\n```", text, re.S)
    if shared_blocks is None: cd = _docs(); shared_blocks = cd.schema_blocks(list(cd.documents()))
    # a block that cannot be read is drawn in part, as the plugin draws it (Roger, 8 Oct 2026, "B").
    # Decided in Standards/2026-10-08 A block that cannot be read is drawn in part, by every reader.decision.md.
    # Checks stay whole.
    store, problems = gp.read_for_drawing(blocks, shared_blocks)
    said = lambda p: f"line {p['line']}: {p['message']}" + (f" — {p['fix']}" if p.get('fix') else '') + (f" (left out: {p['dropped'].strip()})" if p.get('dropped') else '')
    unread = [(p['graph'], said(p)) for p in problems if p.get('severity') == 'error']
    w = gr.World.from_store(store); own = note_schemas(path)
    # 0.4.3 (14 Oct 2026): a thing written with no name is read under its suggested name, with a warning that names it.
    # It is drawn dashed and labelled as suggested (unnamed_drawn_suggested).
    # A graph's style graph gives its nudges and direction, and the drawing honours them as the plugin does
    # (python_honours_nudges). Neither is written to the note.
    extras = {}
    for name in w.graphs:
        mine = [p for p in problems if p.get('graph') == name and p.get('severity') != 'error']
        style, wrong = gp.read_style(blocks, name, w)
        extras[name] = {'suggested': {p['suggested'] for p in mine if p.get('suggested')}, 'nudges': style['nudges'], 'direction': style['direction'],
                        'notes': [said(p) for p in mine] + [f"style: {said(p)}" for p in wrong]}
    return w, (lambda name: None if w[name].labelled('ElementType') else (w.schema_for(name)[1] or own.get(name))), unread, extras

def draw(rel, text=None):
    """The drawing's Markdown, and whether every graph passed its checks — for the gql blocks in text (default: the whole note)."""
    path = rel if os.path.isabs(rel) else os.path.join(VAULT, rel)
    if text is None: text = open(path, encoding='utf-8').read()
    w, schema_of, unread, extras = world(path, text)
    out, ok = [], not unread
    for g, e in unread:
        out.append(f"> [!warning] A block in graph `{g}` could not be read whole, so only what could be read is drawn\n> {e}\n"); print(f"graph {g}: {e}", file=sys.stderr)
    import graph_spec as gs
    matrix = gs.destination_matrix()
    for name in sorted(w.graphs):
        g = w[name]; shared = schema_of(name); x = extras.get(name, {})
        for msg in x.get('notes', []):   # a warning or a style problem is stated, never dropped quietly; the graph is still drawn
            out.append(f"> [!note] Graph `{name}`: {msg}\n"); print(f"graph {name}: {msg}", file=sys.stderr); ok = False
        try: pic, n, e = svg(g, shared, x)
        except RuntimeError as err:   # no Graphviz: fall back to Mermaid, and say so — a drawing never quietly disappears
            print(f"graph {name}: {err}; drawn with Mermaid instead", file=sys.stderr)
            mm, n, e = mermaid(g, shared); pic = f"> [!warning] Drawn with Mermaid because {err} — the layout is rougher.\n\n```mermaid\n{mm}\n```"
        if not n: continue
        fails = [l for l, good, _ in gr.check(w, name, matrix) if not good]
        ok = ok and not fails
        out.append(f"**Graph `{name}`** — {n} things, {e} relationships · " + ('✅ passes its checks' if not fails else f"❌ fails {len(fails)} check(s): " + '; '.join(fails)))
        out.append(f"\n{pic}\n")
        leg = gr.legend(g, shared)
        if leg: out.append('*Relationships drawn:* ' + ' · '.join(f"*{l.split(' = ')[0]}* = `{l.split(' = ')[1].split(' · ')[0]}`" for l in leg.split('\n')) + '\n')
    if not out: out.append("> [!warning] This note holds no graph to draw — no `gql` block with a `// graph:` line.\n"); ok = False
    return '\n'.join(out).rstrip() + '\n', ok

def region(body):
    return (f"{START} — generated by zzSupport/_scripts/graph_spec_draw.py; do not hand-edit -->\n"
            "> [!info] Drawn from the graph above by `zzSupport/_scripts/graph_spec_draw.py` — edit the graph, then ask again: *Draw the graph in this note.*\n\n"
            f"{body}{END}")

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args: print(__doc__.split('Writes:')[0]); return 2
    rel = args[0]; path = rel if os.path.isabs(rel) else os.path.join(VAULT, rel)
    text = open(path, encoding='utf-8').read()
    spans = [m.span() for m in re.finditer(re.escape(START) + r".*?" + re.escape(END), text, re.S)]
    if '--write' not in sys.argv:
        body, ok = draw(rel, text[:spans[-1][0]] if spans else text); print(body); return 0 if ok else 1
    new, ok = text, True
    for a, b in reversed(spans):   # each region draws the blocks above it; replaced from the end so earlier offsets hold
        body, good = draw(rel, text[:a]); ok = ok and good
        new = new[:a] + region(body) + new[b:]
    if not spans:
        body, ok = draw(rel, text); new = text.rstrip() + "\n\n## Drawing\n\n" + region(body) + "\n"
    if new == text: print(f"unchanged — the drawing in {os.path.relpath(path, VAULT)} is current"); return 0 if ok else 1
    bdir = os.path.expanduser('~/zzBackups/notes'); os.makedirs(bdir, exist_ok=True)
    shutil.copy2(path, os.path.join(bdir, f"{os.path.basename(path)}.{dt.datetime.now():%Y%m%d-%H%M%S}"))
    open(path, 'w', encoding='utf-8').write(new)
    print(f"drew {os.path.relpath(path, VAULT)}" + ('' if ok else ' — with failures stated above the drawing')); return 0 if ok else 1

if __name__ == '__main__': sys.exit(main())
