"""Properties shown inline (editor spec §14): which properties of each box and link a drawing
shows, as its style graph switches them on or off for a kind, a thing or a relationship type, in
the whole graph or a view (properties_switch); and those rows written into the layout source below
the text of their box or the reading of their link, at the kind caption's size, in the box's text
colour or the link's label colour (properties_readable). A box or link that would be crowded shows
whole properties up to INLINE_ROWS rows and says how many are hidden (crowded_properties). The
core's inline-properties.ts, function for function, so graph_svg shows them as the plugin does,
byte for byte."""

from __future__ import annotations

import datetime as dt
import html
import re
import textwrap
from collections.abc import Iterable, Mapping, Sequence
from decimal import Decimal

from graphspec.style.arrows import LINK_LINE
from graphspec.style.words import LOCKED

# The most rows of properties a box or link shows, the row saying how many are hidden among them.
INLINE_ROWS = 4
# How a box's line opens its label, a table.
_BOX_LABEL = "[label=<<table "


def _js_number(v: float) -> str:
    """A number as JavaScript writes it (Number::toString), as the core reads every number: the
    shortest digits that read back the same, in plain form from 1e-6 up to 1e21."""
    if v != v:
        return "NaN"
    if v in (float("inf"), float("-inf")):
        return "Infinity" if v > 0 else "-Infinity"
    if v == 0:
        return "0"
    sign = "-" if v < 0 else ""
    t = Decimal(repr(abs(v))).normalize().as_tuple()
    digits = "".join(str(d) for d in t.digits)
    k, n = len(digits), int(t.exponent) + len(digits)
    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return f"{sign}{digits[:n]}.{digits[n:]}"
    if -6 < n <= 0:
        return f"{sign}0.{'0' * -n}{digits}"
    e = n - 1
    mantissa = digits if k == 1 else f"{digits[0]}.{digits[1:]}"
    return f"{sign}{mantissa}e{'+' if e >= 0 else '-'}{abs(e)}"


def value_text(v: object) -> str:
    """A value as it is said inline, as the core says it: text as written, a number as JavaScript
    writes it, true or false, and a date or an instant as the reader keeps it (its ISO day, or its
    UTC time)."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        try:
            return _js_number(float(v))
        except OverflowError:  # an integer past every float: JavaScript reads it as infinite
            return "Infinity" if v > 0 else "-Infinity"
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    return str(v)


def _fits(s, target):
    if "type" in target:
        return s.get("type") == target["type"]
    if s.get("thing") is not None:
        return s["thing"] == target["key"]
    return s.get("kind") is not None and s["kind"] in target["kinds"]


def _rows_for(shows, view, target, props):
    """The rows a box or link shows in `view`: for each property a Show in scope names, in the
    order first named, the most particular such Show decides — one for the view over one for the
    whole graph, then one for the thing over one for its kind, the first written when two are as
    particular — and it is shown when that Show is on and the value is there."""
    chosen = {}
    for s in shows:
        if (s.get("view") is not None and s["view"] != view) or not _fits(s, target):
            continue
        rank = (2 if s.get("view") is not None else 0) + (1 if s.get("thing") is not None else 0)
        was = chosen.get(s["property"])
        if was is None or rank > was[1]:
            chosen[s["property"]] = (s["inline"] == "on", rank)
    return [[p, value_text(props[p])] for p, (on, _) in chosen.items() if on and p in props]


def inline_rows(
    boxes: Iterable[tuple[str, str, Mapping]],
    links: Iterable[tuple[str, Mapping]],
    shows: Sequence[dict],
    view: str | None = None,
) -> dict[str, list]:
    """The properties a drawing shows inline in `view` (None: the whole graph), as the core's
    inlineRows gives them: {boxes: [[key, rows]], links: [[index, rows]]}, each row [name, value
    in words], only boxes and links that show any. boxes: (key, kinds joined by ' · ', properties);
    links: (relationship type, properties), in the order drawn; shows: as read_style gives them."""
    out: dict[str, list] = {"boxes": [], "links": []}
    if not shows:
        return out
    for key, kind, props in boxes:
        rows = _rows_for(
            shows, view, {"key": key, "kinds": kind.split(" · ") if kind else []}, props
        )
        if rows:
            out["boxes"].append([key, rows])
    for i, (type_, props) in enumerate(links):
        rows = _rows_for(shows, view, {"type": type_}, props)
        if rows:
            out["links"].append([i, rows])
    return out


def _table_rows(rows):
    """The table rows for a box's or link's properties: a gap as the kind caption has, then each
    property as `name: value` wrapped as a box's text is; when they would take more than
    INLINE_ROWS rows, the whole properties that fit in one fewer, then how many are hidden."""
    wrapped = [
        textwrap.wrap(f"{name}: {value}", LOCKED["wrap_chars"], break_on_hyphens=False) or [""]
        for name, value in rows
    ]
    lines = [line for w in wrapped for line in w]
    if len(lines) > INLINE_ROWS:
        kept, shown = [], 0
        for w in wrapped:
            if len(kept) + len(w) > INLINE_ROWS - 1:
                break
            kept.extend(w)
            shown += 1
        hidden = len(rows) - shown
        lines = [*kept, f"{hidden} {'property' if hidden == 1 else 'properties'} hidden"]
    size = LOCKED["kind_font_size"]
    cells = "".join(
        f'<tr><td cellpadding="0"><font point-size="{size}">{html.escape(line)}</font></td></tr>'
        for line in lines
    )
    return f'<tr><td cellpadding="0" height="{LOCKED["caption_gap"]}"></td></tr>{cells}'


def inline_source(dot: str, inline: Mapping | None) -> str:
    """The Graphviz source `dot` with the properties of `inline` (as inline_rows gives them) shown:
    a box's rows at the foot of its label's table, below its text; a link's label made a table of
    its reading and, below it, its rows. With nothing to show, `dot` unchanged."""
    if not inline or (not inline["boxes"] and not inline["links"]):
        return dot
    boxes = {f'  "{key}" {_BOX_LABEL}': rows for key, rows in inline["boxes"]}
    links = {i: rows for i, rows in inline["links"]}
    n, out = -1, []
    for line in dot.split("\n"):
        if LINK_LINE.match(line):
            n += 1
            rows = links.get(n)
            if rows:
                line = re.sub(
                    r'\[label="([^"]*)"',
                    lambda m, rows=rows: (
                        '[label=<<table border="0" cellborder="0" cellspacing="0" cellpadding="0">'
                        f"<tr><td>{m.group(1)}</td></tr>{_table_rows(rows)}</table>>"
                    ),
                    line,
                    count=1,
                )
        else:
            at = line.find(_BOX_LABEL)
            rows = boxes.get(line[: at + len(_BOX_LABEL)]) if at >= 0 else None
            if rows:
                end = line.find("</table>>")
                line = line[:end] + _table_rows(rows) + line[end:]
        out.append(line)
    return "\n".join(out)
