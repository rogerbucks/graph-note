#!/usr/bin/env python3
"""Lays out a graph with Graphviz and returns it as inline SVG that follows Obsidian's light and
dark themes.

Usage:
  from graph_svg import available, render
      # render(nodes, edges) -> '<svg …>' string; available() -> bool
  python3 python/graph_spec/src/graph_svg.py   # self-test: draws a small graph to stdout

Writes: nothing (read-only library). Presentation comes from graph_svg.style.json beside it.

Why Graphviz: a diagram whose relationships get a little complex was almost impossible to read with
Mermaid's flowchart layout, which leaves crossings in and drops edge labels on top of each other.
Graphviz's dot is built for layered graphs: it minimises crossings and gives every edge label its
own space. So the layout is Graphviz's, and the drawing is designed around it:
- things of one kind stand in one column when no link joins two of them, so the eye reads kind by
  kind;
- each box says its kind in small capitals above its text, and its kind's colour repeats that —
  colour is never the only cue;
- long text wraps at about 22 characters, so columns stay narrow and the drawing fits a note with
  little shrinking;
- each relationship type has its colour, and its label is the colour of its line, so a label is
  never matched to the wrong link.
Readability: lines inside a box are spaced 1.25x the font size — label spacing, not paragraph
spacing: at 1.5x the lines of one box read as separate sentences — the caption has its own gap and
letter-spacing, boxes keep about one em of padding, and every colour is blended to meet WCAG
contrast in both themes. The numbers live in the style sidecar, each with its reason.
Colours are Obsidian theme variables written as inline styles, because a note's SVG cannot carry a
stylesheet reliably.
Each colour is chosen from the kind's or reading's own name, so it is the same in every step and
every note (first cut chose by alphabetical position, and Reason changed colour between steps). The
drawing sits in a .mermaid box so the Mermaid Zoom plugin gives it zoom, drag and fullscreen; that
plugin inverts a diagram's colours in dark mode (it assumes Mermaid's light theme), so the SVG
carries filter:none — it already follows the theme.
If Graphviz is missing, available() says so and the caller falls back to Mermaid, loudly — a
drawing never disappears.
"""

import html
import json
import os
import re
import shutil
import subprocess
import textwrap
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
STYLE = json.load(open(os.path.join(HERE, "graph_svg.style.json"), encoding="utf-8"))
DOT = shutil.which("dot") or next(
    (p for p in ("/opt/homebrew/bin/dot", "/usr/local/bin/dot") if os.path.exists(p)), None
)


def available():
    return DOT is not None


def _pick(names, palette, pinned):
    """A colour per name, chosen from the name itself (a checksum), so a kind or a reading keeps
    its colour in every step and every note. names come in order of first appearance; on a clash
    the later name moves to the next free colour, so a graph that grows never recolours what it
    already had."""
    out, taken = {}, set()
    for n in names:
        if n in pinned:
            out[n] = pinned[n]
            continue
        i = zlib.crc32(n.encode()) % len(palette)
        for k in range(len(palette)):
            if palette[(i + k) % len(palette)] not in taken:
                i = (i + k) % len(palette)
                break
        out[n] = palette[i]
        taken.add(palette[i])
    return out


def _hue(kind, kinds):
    """The colour name for a kind: pinned in the sidecar, else chosen from its name."""
    return _pick(kinds, STYLE["kind_hues"], STYLE["kind_colours"])[kind]


def _label(kind, text):
    """A box's text as a table, one row per line, so line spacing can be set: Graphviz's own <br/>
    spacing is about 1.0x the font size. The extra space per line, (line_height - 1.0) x font size
    in whole points, is split between the cell's padding (twice, above and below) and the table's
    cell spacing (once), since Graphviz takes only whole points for both.
    The kind's caption gets a gap of its own beneath it."""
    style = STYLE
    lines = textwrap.wrap(text, style["wrap_chars"], break_on_hyphens=False) or [""]
    extra = max(0, round((style["line_height"] - 1.0) * style["font_size"]))
    pad, spacing = extra // 2, extra % 2
    rows = "".join(f'<tr><td cellpadding="{pad}">{html.escape(line)}</td></tr>' for line in lines)
    cap = (
        (
            f'<tr><td cellpadding="0"><font point-size="{style["kind_font_size"]}" '
            f'color="#0000fe">{html.escape(kind.upper())}</font></td></tr>'
            f'<tr><td cellpadding="0" height="{style["caption_gap"]}"></td></tr>'
        )
        if kind
        else ""
    )
    return (
        f'<<table border="0" cellborder="0" cellspacing="{spacing}" cellpadding="0">'
        f"{cap}{rows}</table>>"
    )


def dot_source(nodes, edges, rankdir=None):
    """nodes: [(key, kind, text)]; edges: [(source key, reading, target key)]. Kind colours are
    placeholders #0001xx."""
    # order of first appearance — colours depend on it
    kinds = list(dict.fromkeys(k for _, k, _ in nodes if k))
    style = STYLE
    out = [
        "digraph G {",
        f"  graph [rankdir={rankdir or style['rankdir']}, ranksep={style['ranksep']}, "
        f'nodesep={style["nodesep"]}, bgcolor="transparent", pad=0.1];',
        f'  node [shape=box, style="rounded,filled", fontname="{style["font"]}", '
        f'fontsize={style["font_size"]}, fontcolor="#0000fd", penwidth=1.2, '
        f'margin="{style["box_padding"]}"];',
        f'  edge [fontname="{style["font"]}", fontsize={style["edge_font_size"]}, '
        f'fontcolor="#0000fe", color="#0000fc", arrowsize=0.7, penwidth=1.0];',
    ]
    for key, kind, text in nodes:
        i = kinds.index(kind) if kind else 99
        out.append(
            f'  "{key}" [label={_label(kind, text)}, '
            f'fillcolor="#0001{i:02x}", color="#0002{i:02x}"];'
        )
    # one column per kind, when no link joins two things of that kind
    of = {key: kind for key, kind, _ in nodes}
    for kind in kinds:
        members = [key for key, k, _ in nodes if k == kind]
        if len(members) > 1 and not any(
            of.get(s) == kind and of.get(d) == kind for s, _, d in edges
        ):
            out.append("  { rank=same; " + " ".join(f'"{m}";' for m in members) + " }")
    # A kind that only receives links (a dead end, like Source) and is not the graph's main
    # destination is laid out on the far side, so its links stay short instead of crossing the
    # middle; the arrow still points the way the link reads.
    reach = {k: set() for k in kinds}
    for _ in kinds:
        for s, _, d in edges:
            if of.get(s) and of.get(d):
                reach[of[s]] |= {of[d]} | reach[of[d]]
    sinks = [
        k
        for k in kinds
        if not any(of.get(s) == k for s, _, _ in edges)
        and any(of.get(d) == k for _, _, d in edges)
    ]
    main = max(sinks, key=lambda k: sum(k in reach[o] for o in kinds), default=None)
    readings = list(dict.fromkeys(r for _, r, _ in edges))
    for s, reading, d in edges:
        # line #0003xx, its label #0004xx — blended differently, for their contrast minimums
        i = readings.index(reading)
        a = f'label="{html.escape(reading)}", color="#0003{i:02x}", fontcolor="#0004{i:02x}"'
        out.append(
            f'  "{d}" -> "{s}" [{a}, dir=back];'
            if of.get(d) in sinks and of.get(d) != main
            else f'  "{s}" -> "{d}" [{a}];'
        )
    out.append("}")
    return "\n".join(out), kinds, readings


def _themed(svg, kinds, readings=()):
    """Swap the placeholder colours for Obsidian theme variables, as inline styles, and make the
    SVG fit a note."""
    style = STYLE
    colour = {
        "#0000fd": style["text"],
        "#0000fe": style["muted"],
        "#0000fc": style["edge"],
        "#000000": style["edge"],
    }

    # Contrast (WCAG 2.2): a theme's own hues fall short on its background — light-mode yellow is
    # 2.1:1 — so each is blended with the theme's text colour: lines and borders to line_mix (3:1
    # for shapes, SC 1.4.11), labels to label_mix (4.5:1 for text, SC 1.4.3). Measured on
    # Obsidian's default themes: every label 5.4:1 or more, every line 3.2:1 or more.
    def blend(h, pct):
        return f"color-mix(in srgb, var(--color-{h}) {pct}%, var(--text-normal))"

    kh = _pick(kinds, style["kind_hues"], style["kind_colours"])
    for i, k in enumerate(kinds):
        h = kh[k]
        colour[f"#0001{i:02x}"] = f"rgba(var(--color-{h}-rgb), {style['fill_opacity']})"
        colour[f"#0002{i:02x}"] = blend(h, style["line_mix"])
    eh = _pick(readings, style["edge_hues"], style["edge_colours"])
    for i, r in enumerate(readings):
        colour[f"#0003{i:02x}"] = blend(eh[r], style["line_mix"])
        colour[f"#0004{i:02x}"] = blend(eh[r], style["label_mix"])

    def fix(m):
        tag = m.group(0)
        declarations = []
        for attr in ("fill", "stroke"):
            a = re.search(rf'\s{attr}="(#[0-9a-f]{{6}})"', tag)
            if a and a.group(1) in colour:
                tag = tag.replace(a.group(0), "")
                declarations.append(f"{attr}:{colour[a.group(1)]}")
        if not declarations:
            return tag
        return tag.replace(" ", f' style="{";".join(declarations)}" ', 1)

    # the kind caption is in capitals: tracked out a little, as capitals need, and kept centred
    def track(m):
        tag, n = m.group(1), len(m.group(2))
        ls = style["caption_letter_spacing"] * style["kind_font_size"]
        if 'text-anchor="start"' in tag:
            tag = re.sub(
                r'\sx="([\d.-]+)"', lambda x: f' x="{float(x.group(1)) - n * ls / 2:.2f}"', tag, 1
            )
        return (
            tag.replace("<text ", f'<text letter-spacing="{ls:.2f}" ', 1) + m.group(2) + "</text>"
        )

    svg = re.sub(r'(<text[^>]*fill="#0000fe"[^>]*>)([^<]*)</text>', track, svg)
    svg = re.sub(r"<(?:path|polygon|ellipse|polyline|text)\b[^>]*>", fix, svg)
    svg = re.sub(r"<\?xml.*?\?>|<!DOCTYPE.*?>|<!--.*?-->|<title>.*?</title>", "", svg, flags=re.S)
    m = re.search(r'<svg width="([\d.]+)pt" height="([\d.]+)pt"', svg)
    if m:
        w = float(m.group(1)) * 4 / 3
        # A natural width, no height, capped at the page: the note shrinks it to fit and never
        # clips it, and the zoom plugin's full-screen view, which lays the SVG out at its intrinsic
        # width, has one to use. Tried and dropped, 6 Oct 2026, each seen in Obsidian: a minimum
        # width (the plugin's box clipped the right edge); a fixed height (full-screen lost the
        # bottom); width 100% (no intrinsic width, so full-screen fell back to the browser's 300 px
        # and showed it tiny).
        svg = svg.replace(
            m.group(0), f'<svg width="{w:.0f}" style="max-width:100%;height:auto;filter:none"', 1
        )
    # an HTML block in Markdown ends at a blank line, and an indented line can read as code — so
    # neither may appear
    return "\n".join(line.strip() for line in svg.splitlines() if line.strip())


def _layout(nodes, edges, rankdir):
    src, kinds, readings = dot_source(nodes, edges, rankdir)
    r = subprocess.run([DOT, "-Tsvg"], input=src, capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError(f"Graphviz failed: {r.stderr.strip()[:300]}")
    m = re.search(r'<svg width="([\d.]+)pt" height="([\d.]+)pt"', r.stdout)
    return r.stdout, kinds, readings, float(m.group(1)) * 4 / 3, float(m.group(2)) * 4 / 3


def render(nodes, edges):
    """The graph as one block of inline SVG. Raises RuntimeError if Graphviz is missing or fails.
    Laid out both left-to-right and top-to-bottom; the one that shrinks least to fit the page width
    wins, because a drawing shrunk to fit a narrow note is a drawing nobody can read — the text in
    its boxes becomes hard to read. A tall drawing is capped, so a long chain is not stood on
    end."""
    if not DOT:
        raise RuntimeError("Graphviz (dot) is not installed")
    target, best = STYLE["page_width"], None
    for rd in STYLE["directions"]:
        svg, kinds, readings, w, h = _layout(nodes, edges, rd)
        fit = min(1.0, target / w) - (
            0.25 if h > STYLE["max_height_ratio"] * max(w, target) else 0
        )
        if best is None or fit > best[0] + 0.02:
            best = (fit, svg, kinds, readings)
    return _themed(*best[1:])


if __name__ == "__main__":
    print(
        render(
            [
                ("q", "Question", "Which device?"),
                ("o", "Option", "A tablet"),
                ("r", "Reason", "It costs nothing extra"),
            ],
            [("o", "answers", "q"), ("r", "favours", "o")],
        )
    )
