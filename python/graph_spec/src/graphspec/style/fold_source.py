"""The layout source of a folded, merged or routed graph (editor spec §25), as the plugin's core
writes it (fold-source.ts), byte for byte: the last steps after the source is made, so with
nothing folded, merged or routed it stays the layout source as it is. Folded, a busy hub's links
are one stub marked with their count (untangle_hubs) and a group is one box showing its count
(untangle_groups); merged, two or more links running from one group to another share a trunk
(untangle_merge); routed, links are straight or right-angled (untangle_routing). Every box and
link still drawn keeps the id Graphviz gave it unfolded (node3, edge7), and each link of a trunk is
drawn as its own two lines (edge7_tail, edge7)."""

from __future__ import annotations

import html
import re
from collections.abc import Mapping

from graphspec.style.arrows import LINK_LINE
from graphspec.style.words import LOCKED

_NODE_LINE = re.compile(r'^ {2}"([^"]*)" \[label=')
_LINK_PARTS = re.compile(r'^ {2}"([^"]*)" -> "([^"]*)" \[(.*)\];$')
_INVISIBLE = re.compile(r'^ {2}"([^"]*)" -> "([^"]*)" \[style=invis\];$')
_KIND_COLUMN = "  { rank=same; "
_SAME_RANK = "  {rank=same; "
_CLUSTER = "  subgraph cluster_"
# a quoted word and a semicolon in a box's line: one of its things, unless an attribute's value
_QUOTED_ITEM = re.compile(r'"([^"]*)"; ')
_QUOTED = re.compile(r'"([^"]*)"')
_COLOUR = re.compile(r', color="(#[0-9a-f]{6})"')
_MUTED = 'color="#0000fe", fontcolor="#0000fe"'
_LINK_LABEL = re.compile(r'^( {2}"[^"]*" -> "[^"]*" \[(?:id="[^"]*", )?)label=')
_TYPE_CURVES = re.compile(r"^( {2}graph \[.*), splines=true\];$")


def _trunk_lines(link: dict, t: int) -> list[str]:
    """The two lines that draw a link of trunk `t`: from its thing to the trunk, then from the
    trunk on, with its reading."""
    attrs, n = link["attrs"], link["n"] + 1
    m = _COLOUR.search(attrs)
    colour = m.group(1) if m else "#0000fc"
    back = re.search(r", dir=back(,|$)", attrs) is not None
    fixed = ", constraint=false" if "constraint=false" in attrs else ""
    head = attrs.replace(", dir=back", ", dir=none", 1)
    return [
        f'  "{link["from"]}" -> "trunk: {t} in" [id="edge{n}_tail", color="{colour}", '
        f"dir={'back' if back else 'none'}{fixed}];",
        f'  "trunk: {t} out" -> "{link["to"]}" [id="edge{n}", {head}];',
    ]


def folded_source(dot: str, plan: Mapping | None) -> str:
    """The Graphviz source `dot` (as graph_svg writes it, nudges and all) as `plan` (folding.py,
    fold_plan) folds and merges it, as the core's foldedSource does: each thing hidden and each
    link folded left out, and named nowhere else; a folded group's things drawn as its box, the
    links to them drawn to the box and its box around them gone; each line left given its
    unfolded id; then each folded group's box, each hub's stub and each trunk, before the last
    line. With no plan, or nothing it changes, `dot`."""
    if not plan:
        return dot
    hidden, folded = set(plan["hidden"]), set(plan["folded"])
    box: dict[str, str] = {}
    group_of: dict[str, int] = {}
    for i, (_label, things, is_folded) in enumerate(plan["groups"]):
        for k in things:
            if is_folded:
                box[k] = f"group: {i + 1}"
        for k in [f"group: {i + 1}"] if is_folded else things:
            group_of[k] = i

    def gone(k):
        return k in hidden or k in box

    lines, drawn, n = dot.split("\n"), {}, -1
    for line in lines:
        if not LINK_LINE.match(line):
            continue
        m = _LINK_PARTS.match(line)
        n += 1
        if n in folded or not m:
            continue
        ends = (box.get(m.group(1), m.group(1)), box.get(m.group(2), m.group(2)))
        drawn[n] = {"n": n, "from": ends[0], "to": ends[1], "attrs": m.group(3)}
    # two or more links from one group to another, in the order of their first: a trunk
    pairs: dict[str, list[dict]] = {}
    if plan["merge"]:
        for link in drawn.values():
            a, b = group_of.get(link["from"]), group_of.get(link["to"])
            if a is None or b is None or a == b:
                continue
            pairs.setdefault(f"{a}>{b}", []).append(link)
    trunks = [ls for ls in pairs.values() if len(ls) > 1]
    trunk_of = {link["n"]: t + 1 for t, ls in enumerate(trunks) for link in ls}
    boxes = [
        (i + 1, label, len(things))
        for i, (label, things, is_folded) in enumerate(plan["groups"])
        if is_folded
    ]
    if not hidden and not folded and not plan["hubs"] and not boxes and not trunks:
        return dot

    out, node, n = [], 0, -1
    for line in lines:
        named = _NODE_LINE.match(line)
        if named:
            node += 1
            key = named.group(1)
            start = f'  "{key}" ['
            if not gone(key):
                out.append(f'{start}id="node{node}", {line[len(start) :]}')
        elif LINK_LINE.match(line):
            n += 1
            link, t = drawn.get(n), trunk_of.get(n)
            if link and t is not None:
                out.extend(_trunk_lines(link, t))
            elif link:
                ends = f'"{link["from"]}" -> "{link["to"]}"'
                out.append(f'  {ends} [id="edge{n + 1}", {link["attrs"]}];')
        elif line.startswith(_KIND_COLUMN) or line.startswith(_SAME_RANK):
            keep = [k for k in _QUOTED.findall(line) if not gone(k)]
            if len(keep) > 1:
                out.append(
                    _KIND_COLUMN + " ".join(f'"{k}";' for k in keep) + " }"
                    if line.startswith(_KIND_COLUMN)
                    else _SAME_RANK + "; ".join(f'"{k}"' for k in keep) + ";}"
                )
        elif _INVISIBLE.match(line):
            if not any(gone(k) for k in _QUOTED.findall(line)):
                out.append(line)
        elif line.startswith(_CLUSTER):
            out.extend(_cluster(line, gone))
        else:
            out.append(line)
    out[-1:-1] = _added(boxes, plan["hubs"], len(trunks))
    return "\n".join(out)


def _cluster(line: str, gone) -> list[str]:
    """A box's line with its things that are gone taken out; none when every thing in it is."""

    def member(at):
        return line[at - 1] != "="

    members = [m.group(1) for m in _QUOTED_ITEM.finditer(line) if member(m.start())]
    if members and all(gone(k) for k in members):
        return []
    kept = _QUOTED_ITEM.sub(
        lambda m: "" if member(m.start()) and gone(m.group(1)) else m.group(0), line
    )
    return [kept]


def _added(boxes: list, hubs: list, trunks: int) -> list[str]:
    """The lines a fold adds: each folded group's box, each hub's stub, then each trunk."""
    size = LOCKED["kind_font_size"]
    out = [
        f'  "group: {i}" [id="fold_group_{i}", label=<{html.escape(label)}<br/>'
        f'<font point-size="{size}">{count} thing{"" if count == 1 else "s"}</font>>, '
        f'style="rounded", {_MUTED}];'
        for i, label, count in boxes
    ]
    for j, (hub, count) in enumerate(hubs, start=1):
        out.append(
            f'  "hub: {j}" [id="fold_hub_{j}", label="{count} link{"" if count == 1 else "s"}", '
            f'shape=box, style="rounded,dashed", fontsize={size}, {_MUTED}];'
        )
        out.append(
            f'  "{hub}" -> "hub: {j}" [id="fold_hub_{j}_link", style=dashed, dir=none, '
            'color="#0000fe"];'
        )
    for t in range(1, trunks + 1):
        out.append(f'  "trunk: {t} in" [id="trunk_{t}_in", shape=point, width=0.08, label=""];')
        out.append(f'  "trunk: {t} out" [id="trunk_{t}_out", shape=point, width=0.08, label=""];')
        out.append(
            f'  "trunk: {t} in" -> "trunk: {t} out" [id="trunk_{t}", dir=none, penwidth=2.5];'
        )
    return out


def routed_source(dot: str, routing: str | None) -> str:
    """The source `dot` with its links routed (untangle_routing), as the core's routedSource
    does: straight lines, or right angles, whose readings are set beside them (xlabel); the curves
    a radial drawing asks for (typed_source) give way to them. Curved, or None, is how Graphviz
    draws them: `dot` unchanged. Direct links are laid out straight, as the core lays them out
    before it draws them again as curves (direct-links.ts)."""
    if routing not in ("straight", "right-angled", "direct"):
        return dot
    lines = [_TYPE_CURVES.sub(r"\1];", line) for line in dot.split("\n")]
    if routing == "right-angled":
        lines = [_LINK_LABEL.sub(r"\1xlabel=", line, count=1) for line in lines]
    lines.insert(1, f"  graph [splines={'ortho' if routing == 'right-angled' else 'line'}];")
    return "\n".join(lines)
