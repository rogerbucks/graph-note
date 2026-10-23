"""Reads a note's blocks for drawing: what can be read of a block is drawn, and the rest is
listed as problems (decided 8 Oct 2026)."""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from typing import Any

from graphspec.reader.block_items import _items, _line_at, _without
from graphspec.reader.lexer import COMMENT_FIX, COMMENT_RULE, ProfileError, header
from graphspec.reader.name_gaps import suggested_names, with_names
from graphspec.reader.store import Store
from graphspec.reader.whitespace import SPACE, N, S, rstrip, strip

GRAPH_OF = re.compile(rf"{S}*//{S}*graph:{S}*({N}+)")
GRAPH_LINE = re.compile(rf"{S}*//{S}*graph:")
# a style block (editor spec §2): its graph line says STYLE and the graph it styles, as the core's
# blocks.ts reads it — `// graph: trip_style · STYLE trip`
STYLES = re.compile(rf"{S}*//{S}*graph:[^\n]*·{S}*STYLE{S}+([^{SPACE}·]+)")
STYLE_WORD = re.compile(rf"{S}*//{S}*graph:[^\n]*·{S}*STYLE(?:{S}|·|\Z)")
# a block drawn from elsewhere (editor spec §20). Its graph line says FROM and a .gql file or a
# note, as the core's blocks.ts reads it (isSourceBlock): `// graph: trip · FROM Graphs/trip.gql`
FROM_WORD = re.compile(rf"{S}*//{S}*graph:[^\n]*·{S}*FROM(?:{S}|·|\Z)")


# ── Drawing in part ──────────────────────────────────────────────────────────────────────────────
# A block that cannot be read is drawn in part, by every reader (decided with Roger, 8 Oct 2026).
# What can be read of it is drawn, exactly as packages/core/src/drawing.ts reads it, and the rest
# is listed. Drawing only: Store.apply, and so checking and loading, stay all-or-nothing.
# A thing written without a name is drawn under its suggested name (10 Oct 2026). It is read in
# from a copy of its block. The note is never changed.
# The one exception is the plugin's alone (10 Oct 2026). A note whose graph blocks are too large
# to read on a phone without freezing it is not read by the plugin at all. So it draws nothing to
# compare. The limits are READ_LIMITS in packages/core/src/layout-limits.ts: 512 kB or 10,000
# lines.


def _first_line(text):
    return next((line for line in text.split("\n") if strip(line)), "")


def _graph_of(text):
    m = GRAPH_OF.match(_first_line(text))
    return m.group(1) if m else None


def style_of(text: str) -> str | None:
    """The graph a style block styles (editor spec §2): its graph line says STYLE and the graph's
    name, `// graph: trip_style · STYLE trip`. None for any other block. A style block is never
    data to draw; graphspec/style/reading.py reads it."""
    m = STYLES.match(_first_line(text))
    return m.group(1) if m else None


def _data_kind(text):
    """'data' or 'schema' for a block to draw; None for a query, excerpt, change set, style block,
    a block drawn FROM a file or a note, or plain code; or the problem with a graph line that
    cannot be read, or with a style block that names no graph to style."""
    if style_of(text) is not None or FROM_WORD.match(_first_line(text)):
        return None
    if STYLE_WORD.match(_first_line(text)):
        own = _graph_of(text) or "<name>"
        return {
            "graph": None,
            "block": -1,
            "line": 1,
            "severity": "error",
            "message": "this style block names no graph to style, so it is not read",
            "fix": f"write the graph it styles after STYLE: '// graph: {own} · STYLE <graph>'",
            "code": "GN708",
        }
    try:
        _, kind = header(text)
        return kind if kind in ("data", "schema") else None
    except ProfileError as e:
        if not GRAPH_LINE.match(_first_line(text)):
            return None
        return {
            "graph": None,
            "block": -1,
            "line": e.line,
            "severity": "error",
            "message": e.message,
            "fix": e.fix,
            "code": e.code,
        }


def _u16(s):
    """A place on a line as an editor counts it: in UTF-16 units, an emoji being two."""
    return len(s.encode("utf-16-le")) // 2


def _line_end_comments(text):
    """Each comment after code on its line (§3: comments are whole lines, as // also occurs inside
    identifiers): the block with them blanked, and a warning for each that names the rule."""
    problems, out = [], []
    for n, line in enumerate(text.split("\n")):
        if strip(line).startswith("//"):
            out.append(line)
            continue
        quoted, i, cut = False, 0, None
        while i < len(line):
            c = line[i]
            if quoted:
                if c == "\\":
                    i += 1
                elif c == "'":
                    quoted = False
            elif c == "'":
                quoted = True
            elif line.startswith("//", i) and strip(line[:i]):
                cut = i
                break
            i += 1
        if cut is None:
            out.append(line)
            continue
        start = len(rstrip(line[:cut]))
        problems.append(
            {
                "line": n + 1,
                "severity": "warning",
                "message": COMMENT_RULE,
                "fix": COMMENT_FIX,
                "code": "GN103",
                "character": _u16(line[:start]),
            }
        )
        out.append(line[:cut] + " " * (len(line) - cut))
    return "\n".join(out), problems


def _dangling_comma(text):
    """A comma with nothing after it at a block's end, but blank lines and comments: the commonest
    state while the next pattern is being typed, so never a failure of the block (8 Oct 2026). The
    block as read without it, and one warning whose fix removes it; None when there is none."""
    every = _items(text)
    if not every or every[-1][2] == -1:
        return None
    at = every[-1][2]
    before = text[:at].split("\n")
    return text[:at] + " " + text[at + 1 :], {
        "line": len(before),
        "severity": "warning",
        "message": "a comma with nothing after it; it is read as if it were not there",
        "fix": "remove the comma, or write the next pattern after it",
        "code": "GN701",
        "character": _u16(before[-1]),
    }


# How much may be read again, in UTF-16 units, while a block's parts that cannot be read are left
# out one by one. Each of these is charged its length:
# - each read again of the failing block;
# - each trial to tell which of several parts on a line is at fault.
# Past it, the rest of the block from the failing line is left out at once. The plugin's core
# counts and cuts exactly so (packages/core/src/partial-read.ts, REREAD_BUDGET). So it never
# freezes the page, and both readers draw the same (drawn_in_part, layout_byte_identical,
# 10 Oct 2026).
REREAD_BUDGET = 4_000_000

_CUT = " — too much of this block could not be read, so it is left out from this line on"


def read_for_drawing(
    blocks: Sequence[str],
    shared: Sequence[str] = (),
    budget: int = REREAD_BUDGET,
    kind_of: Callable[[str], Any] | None = None,
) -> tuple[Store, list[dict[str, Any]]]:
    """Reads a note's blocks for drawing, as the plugin's core does, and returns (store, problems).

    Each block is applied in order to a fresh store, after the shared schemas; when one fails, the
    item at the failing line is blanked and the whole read starts again, so a block that cannot
    be read is drawn in part. Each problem is {graph, block, line, severity, message, fix, code}
    and, for an error, dropped: the text left out. A comma with nothing after it at a block's end
    is a warning, with the character it is at on its line, and is read as if it were not there. A
    thing written with text and no name is read under the name suggested for it, from a copy of
    its block, with a warning whose suggested is that name and whose character is the place after
    its ( where the name would go (10 Oct 2026). Reading again is capped by `budget`, in UTF-16
    units, as the core caps it (REREAD_BUDGET above). `kind_of` says which blocks are read, as
    the core's readBlocks is told: the data blocks by default (_data_kind), or a graph's style
    blocks for its style (graphspec/style/reading.py).
    Drawing only — Store.apply, which checks and loads, still refuses the block whole."""
    clean = list(blocks)
    problems, skip = [], set()
    for i, text in enumerate(blocks):
        kind = (kind_of or _data_kind)(text)
        if kind is None:
            skip.add(i)
        elif isinstance(kind, dict):
            skip.add(i)
            problems.append({**kind, "block": i, "graph": _graph_of(text)})
        else:
            clean[i], comments = _line_end_comments(text)
            problems += [{**p, "block": i, "graph": _graph_of(text)} for p in comments]
            dangling = _dangling_comma(clean[i])
            if dangling:
                clean[i] = dangling[0]
                problems.append({**dangling[1], "block": i, "graph": _graph_of(text)})
    # a thing given text but no name: a warning whose fix adds the name suggested. The name is
    # only read in, in a copy, so that the thing is drawn. The note itself is never rewritten
    named = suggested_names(
        [("" if i in skip else t, _graph_of(blocks[i])) for i, t in enumerate(clean)]
    )
    for i, block_named in enumerate(named):
        for n in block_named:
            problems.append(
                {
                    "graph": _graph_of(blocks[i]),
                    "block": i,
                    "line": n["line"] + 1,
                    "severity": "warning",
                    "message": f"this thing has no name; suggested: {n['name']}",
                    "fix": f"add the name {n['name']} after the (, or write one of your own",
                    "code": "GN704",
                    "character": n["character"],
                    "suggested": n["name"],
                }
            )
    attempt = spent = 0
    while True:
        store = Store()
        for text in shared:
            try:
                store.apply(text)
            except ProfileError:
                pass  # a shared schema that cannot be read types nothing
        failed = None
        for i, text in enumerate(clean):
            if i in skip:
                continue
            try:
                store.apply(with_names(text, named[i]))
            except Exception as e:  # as the core: anything that stops a block is a problem
                failed = (i, e)
                break
        if failed is None:
            return store, sorted(problems, key=lambda p: (p["block"], p["line"]))
        block, e = failed
        text = clean[block]
        pe = e if isinstance(e, ProfileError) else None
        line = pe.line if pe else 1
        problem = {
            "graph": _graph_of(text),
            "block": block,
            "line": line,
            "severity": "error",
            "message": pe.message if pe else "this could not be read",
            "fix": pe.fix if pe else "check the line against the guide to writing a graph note",
            "code": pe.code if pe else "GN706",
        }
        every = _items(text)
        # "unexpected '('" straight after a path that ends its line with no comma: say so
        opened = next((k for k, it in enumerate(every) if _line_at(text, it[0]) == line), -1)
        prior = every[opened - 1] if opened > 0 else None
        if (
            pe
            and pe.message == "unexpected '('"
            and prior
            and prior[2] == -1
            and text[prior[1] - 1] == ")"
        ):
            last_line = strip(text[: prior[1]].split("\n")[-1])
            problem["message"] = f"{pe.message} — a comma is missing at the end of the line before"
            problem["fix"] = f"add a comma at the end of the line before, after {last_line}"
        touching = [
            it for it in every if _line_at(text, it[0]) <= line <= _line_at(text, it[1] - 1)
        ]
        before = [it for it in every if _line_at(text, it[0]) <= line]
        drop = touching or before[-1:]
        if not drop or attempt > len(blocks) + len(every) * 2:
            skip.add(block)
            problems.append(problem)
            attempt += 1
            continue
        # each read again of the block, and each trial of it, is charged to the budget; past it,
        # the rest of the block is cut
        cost = _u16(text)
        over = False
        chosen = drop
        if len(drop) > 1:
            # of several items on the failing line, leave out only the one at fault when that can
            # be told

            def at_fault(it):
                try:
                    Store().apply(_without(text, every, [it]))
                    return True
                except Exception as err:
                    return not (isinstance(err, ProfileError) and err.line == line)

            found = None
            for it in drop:
                if spent + cost > budget:
                    over = True
                    break
                spent += cost
                if at_fault(it):
                    found = it
                    break
            chosen = [found or drop[0]]
        if not over and spent + cost > budget:
            over = True
        elif not over:
            spent += cost
        comma = -1
        if over:
            first = drop[0][0]
            chosen = [it for it in every if it[0] >= first]
            problem["message"] += _CUT
            # the comma before what is left out would end the block with nothing after it
            before_cut = [it for it in every if it[0] < first]
            comma = before_cut[-1][2] if before_cut else -1
        cut = _without(text, every, chosen)
        clean[block] = cut if comma == -1 else cut[:comma] + " " + cut[comma + 1 :]
        problems.append({**problem, "dropped": "\n".join(text[a:b] for a, b, _ in chosen)})
        attempt += 1
