"""Reading a document (§3): its GQL block lifted out of Markdown or Word, and its graph read
with its header."""

from __future__ import annotations

import datetime as dt
import re
from typing import Any

from graphspec.engine import settings
from graphspec.engine.optional_imports import grafeo
from graphspec.engine.queries import read, strip
from graphspec.reader.whitespace import N, S
from graphspec.reader.whitespace import strip as ws_strip


# ── reading and restating ─────────────────────────────────────────────────
QUOTES = {"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"'}


GRAPH_LINE = re.compile(rf"{S}*//{S}*graph:{S}*({N}+)")


def graph_name(block: str) -> str | None:
    """The graph a block's first line names (§3), read with whitespace as GQL names it, as the
    graph reader reads it; None when that line names none."""
    first = next((line for line in block.split("\n") if ws_strip(line)), "")
    m = GRAPH_LINE.match(first)
    return m.group(1) if m else None


def require_graph_line(block: str, where: str) -> str:
    """§3: a block's first line names its graph. A block that does not is refused, with the
    reason."""
    if graph_name(block) is None:
        raise ValueError(
            f"refused: the block in {where} names no graph — §3 requires '// graph: "
            "<name>' as its first line"
        )
    return block


def gql_block(path: str, straighten: bool = True) -> str:
    """The GQL block of a document (§3): a fenced gql block in Markdown, or a plain-text content
    control tagged spec:gql in Word, with Word's curly quotes straightened."""
    if path.endswith(".docx"):
        import zipfile
        from lxml import etree as _et

        wml = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        root = _et.fromstring(zipfile.ZipFile(path).read("word/document.xml"))
        for sdt in root.iter(wml + "sdt"):
            tag = sdt.find(f"{wml}sdtPr/{wml}tag")
            if tag is not None and tag.get(wml + "val") == "spec:gql":
                paras = []
                for para in sdt.iter(wml + "p"):
                    paras.append(
                        "".join(
                            "\n" if el.tag == wml + "br" else (el.text or "")
                            for el in para.iter(wml + "t", wml + "br")
                        )
                    )
                text = "\n".join(paras)
                n = sum(text.count(k) for k in QUOTES) if straighten else 0
                for k, v in QUOTES.items() if straighten else ():
                    text = text.replace(k, v)
                if n:
                    settings.NOTICES.append(
                        f"{path.rsplit('/', 1)[-1]}: {n} curly quotes straightened (§3)"
                    )
                return text
        raise ValueError(f"no content control tagged spec:gql in {path}")
    text = open(path, encoding="utf-8").read()
    return re.search(r"```gql\n(.*?)\n```", text, re.S).group(1)


def parse(path: str, straighten: bool = True) -> dict[str, Any]:
    """Lift the GQL block out of a document (§3) and read its header. The block is read with the
    reader first, in its graph, whichever parser is set: a block the reader refuses raises its
    ProfileError, and Grafeo is given nothing (req:3.engine-reads-first). Grafeo is given the
    reader's corrected text, so it reads what the profile parser reads
    (req:3.engine-gets-corrected)."""
    from graphspec.reader.store import Store

    block = require_graph_line(gql_block(path, straighten), path.rsplit("/", 1)[-1])
    m = re.search(
        r"document (\S+) · schema (\S+) · as of (\d{4}-\d\d-\d\d)(?: · revision of (\S+))?", block
    )
    st = Store()
    g = st.apply(block)
    if settings.PARSER == "profile":  # the portable reader — no database
        stored = st.graph(g)
        byk = {k: n["props"]["id"] for k, n in stored["nodes"].items()}
        node_rows = [
            {"k": k, "l": sorted(n["labels"]), "p": dict(n["props"])}
            for k, n in stored["nodes"].items()
        ]
        rel_rows = [{"s": a, "t": b, "ty": t, "p": dict(pp)} for a, t, b, pp in stored["edges"]]
    else:
        db = grafeo.GrafeoDB()
        db.execute("CREATE GRAPH notes")
        db.set_graph("notes")
        db.execute(strip(st.corrected(block)))
        node_rows, rel_rows = read(db, "notes")
        byk = {n["k"]: n["p"]["id"] for n in node_rows}
    return {
        "id": m.group(1),
        "schema": m.group(2),
        "as_of": dt.date.fromisoformat(m.group(3)),
        "revision_of": m.group(4),
        "nodes": {n["p"]["id"]: {"labels": set(n["l"]), "props": dict(n["p"])} for n in node_rows},
        "raw_edges": [(byk[r["s"]], r["ty"], byk[r["t"]], dict(r["p"] or {})) for r in rel_rows],
    }
