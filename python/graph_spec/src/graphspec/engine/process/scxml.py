"""§16: a process exported to SCXML, read back from the XML, and checked equivalent to its
flat original. SCXML is XML, which has comments, so the export keeps each /// note on a State or
a transition as an XML comment before its element (editor spec §24, note_standard)."""

from __future__ import annotations

from collections import deque
from collections.abc import Callable, Iterable, Sequence
from typing import TYPE_CHECKING, Any

from graphspec.engine.optional_imports import etree
from graphspec.engine.process.machine import Machine
from graphspec.engine.queries import Q
from graphspec.reader.lexer import header
from graphspec.reader.notes import notes
from graphspec.reader.store import Store
from graphspec.reader.written_things import written_in
from graphspec.rules.plain_graph import Graph, World

if TYPE_CHECKING:
    from grafeo import GrafeoDB


# ── §16: a sub-flow process checked against its flat original, and its SCXML export ──
NS = "http://www.w3.org/2005/07/scxml"


def ecma(g: str) -> str:
    """A guard written as an ECMAScript condition, for SCXML: = as ===, and as &&, and not as !."""
    return g.replace(" = ", " === ").replace(" and not ", " && !").replace(" and ", " && ")


def _not_xml(c: str) -> bool:
    """Whether XML 1.0 cannot hold a character, even as a reference: a control character other
    than tab, line feed and carriage return, U+FFFE, U+FFFF, or half of a surrogate pair alone."""
    code = ord(c)
    return (
        (code < 0x20 and code not in (0x09, 0x0A, 0x0D))
        or code in (0xFFFE, 0xFFFF)
        or 0xD800 <= code <= 0xDFFF
    )


def note_comment(note: str) -> str:
    """A /// note as the text of the XML comment that holds it, between <!-- and -->, as the
    core's xml-comment.ts writes it (tests/note_comment_cases.json holds both; editor spec §24,
    note_standard): spaced at both ends, a backslash written \\\\, a hyphen directly after a hyphen
    \\-, a carriage return \\r and a character XML cannot hold \\u{its code point in hexadecimal},
    so it holds no -- and no - at its end, can never end its comment, and reads back exactly."""
    out: list[str] = []
    last = ""
    for c in note:
        if c == "\\":
            piece = "\\\\"
        elif c == "\r":
            piece = "\\r"
        elif c == "-" and last == "-":
            piece = "\\-"
        elif _not_xml(c):
            piece = f"\\u{{{ord(c):X}}}"
        else:
            piece = c
        out.append(piece)
        last = piece[-1]
    return " " + "".join(out) + " "


def comment_note(text: str) -> str:
    """The note an XML comment's text holds, as note_comment writes it; raises ValueError for a
    text it would not write: not spaced at both ends, or a backslash before anything but \\, -, r
    or {a code point in hexadecimal}."""
    if len(text) < 2 or text[0] != " " or text[-1] != " ":
        raise ValueError("a note's comment is spaced from its <!-- and its -->")
    s, out, i = text[1:-1], [], 0
    while i < len(s):
        if s[i] != "\\":
            out.append(s[i])
            i += 1
            continue
        e = s[i + 1 : i + 2]
        if e in ("\\", "-"):
            out.append(e)
            i += 2
        elif e == "r":
            out.append("\r")
            i += 2
        elif e == "u" and s[i + 2 : i + 3] == "{":
            end = s.find("}", i + 3)
            digits = s[i + 3 : end] if end >= 0 else ""
            if not 1 <= len(digits) <= 6 or any(d not in "0123456789ABCDEF" for d in digits):
                raise ValueError(f"\\u{{{digits}}} names no character")
            if int(digits, 16) > 0x10FFFF:
                raise ValueError(f"\\u{{{digits}}} names no character")
            out.append(chr(int(digits, 16)))
            i = end + 1
        else:
            raise ValueError(f"\\{e} is no escape a note's comment is written with")
    return "".join(out)


Row = tuple[Any, Any, Any, Any, Any]


def _written_transitions(block: str) -> dict[tuple[str, str], list[Row]]:
    """The block's transitions in the order written, by their ends, each as what its row holds
    (from, to, event, guard, do): the block's own reading, whatever a source's row order."""
    st = Store()
    st.apply(block)
    g = World.from_store(st).graphs.get(header(block)[0])
    out: dict[tuple[str, str], list[Row]] = {}
    for a, t, b, p in g.edges if g else []:
        if t == "TRANSITION":
            out.setdefault((a, b), []).append((a, b, p.get("event"), p.get("guard"), p.get("do")))
    return out


def _noted(block: str, m: Machine) -> tuple[dict[str, str], dict[int, str]]:
    """The notes of a process's block (editor spec §24), as the core's notes.ts puts them on what
    it draws: a State's by its id, its first note kept; a TRANSITION's on the first transition
    with its ends and no note yet, in the order written in the block (never the order a source
    gives its rows in), by the identity of its row in m. A name stands for the id written with
    it, or is its own id (§3). A note on anything else, such as a DETAILED_IN, which SCXML writes
    no element for, is left out. One pass over the notes and one over the rows, each note found
    by a lookup."""
    ids: dict[str, str] = {}
    for w in written_in(block):
        given = w.props.get("id")
        if w.variable and isinstance(given, str):
            ids.setdefault(w.variable[1], given)
    written = _written_transitions(block)
    rows: dict[Row, list[dict[str, Any]]] = {}
    for r in m.moves:
        rows.setdefault((r["a"], r["b"], r["e"], r["g"], r["d"]), []).append(r)
    by_ends: dict[tuple[str, str], int] = {}  # the notes taken so far on each pair of ends
    by_row: dict[Row, int] = {}  # the rows taken so far holding the same
    states: dict[str, str] = {}
    moves: dict[int, str] = {}
    for n in notes(block)["notes"]:
        el = n["element"]
        if "thing" in el:
            s = ids.get(el["thing"], el["thing"])
            if s in m.S:
                states.setdefault(s, n["text"])
            continue
        a, t, b = el["link"]
        if t.upper() != "TRANSITION":
            continue
        ends = (ids.get(a, a), ids.get(b, b))
        k = by_ends.get(ends, 0)
        by_ends[ends] = k + 1
        if k >= len(written.get(ends, [])):
            continue
        key = written[ends][k]
        j = by_row.get(key, 0)
        by_row[key] = j + 1
        if j < len(rows.get(key, [])):
            moves[id(rows[key][j])] = n["text"]
    return states, moves


def to_scxml(db: Graph | GrafeoDB, block: str | None = None) -> str:
    """The process graph as W3C SCXML text: the loan flow's states, each sub-flow nested in the
    state it details, with their transitions and actions — built from the reader's plain graph
    (req:18.scxml-reads-plain), or from a Grafeo database a host asks for. Given the block the
    graph is written in, each /// note on a State or a transition is kept as an XML comment
    directly before its element (editor spec §24, note_standard; note_comment)."""
    m = Machine(db)
    states, moves = _noted(block, m) if block is not None else ({}, {})

    def noted(parent_el, note):
        if note is not None:
            parent_el.append(etree.Comment(note_comment(note)))

    def name(s):
        return s.replace("/", "_")

    def element(tag, **a):
        return etree.Element(f"{{{NS}}}{tag}", **{k: str(v) for k, v in a.items()})

    root = etree.Element(
        f"{{{NS}}}scxml",
        nsmap={None: NS},
        version="1.0",
        datamodel="ecmascript",
        initial=name(m.root),
        name="loan",
    )

    def add(parent_el, s):
        kids = [c for c in m.S if s in m.D and m.S[c]["flow"] == m.S[m.D[s]]["flow"]]
        el = element(
            "final" if m.S[s]["f"] else "state",
            id=name(s),
            **({"initial": name(m.D[s])} if s in m.D else {}),
        )
        noted(parent_el, states.get(s))
        parent_el.append(el)
        for (a, e), ts in sorted(m.T.items()):
            if a != s:
                continue
            for t in sorted(ts, key=lambda t: t["g"] == "else"):
                ev = f"done.state.{name(s)}" if e == "done" else e
                attrs = (
                    {"event": ev}
                    | ({"cond": ecma(t["g"])} if t["g"] and t["g"] != "else" else {})
                    | ({"target": name(t["b"])} if t["b"] != t["a"] else {})
                )
                tr = element("transition", **attrs)
                noted(el, moves.get(id(t)))
                el.append(tr)
                if t["d"]:
                    tr.append(element("log", label="do", expr=f"'{t['d']}'"))
        for c in sorted(kids):
            add(el, c)

    for s in sorted(s for s in m.S if m.S[s]["flow"] == "loan"):
        add(root, s)
    return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding="UTF-8").decode()


class ScxmlReader:
    """Reads the exported XML, not the graph: atomic state first, then its ancestors, transitions
    in document order, first enabled wins (W3C SCXML); entering a <final> child raises
    done.state.<parent>."""

    def __init__(self, xml):
        self.doc = etree.fromstring(xml.encode())
        self.by = {e.get("id"): e for e in self.doc.iter() if e.get("id")}
        self.root_initial = self.doc.get("initial")

    def path(self, el):
        out = []
        while el is not None and el.get("id"):
            out.insert(0, el)
            el = el.getparent()
        return out

    def enter(self, el):
        p = self.path(el)
        while p[-1].get("initial"):
            p.append(self.by[p[-1].get("initial")])
        return p

    def conf(self, p):
        return tuple(e.get("id").replace("_", "/", 1) for e in p)

    def start(self):
        return self.conf(self.enter(self.by[self.root_initial]))

    def cond(self, c, ctx):
        return eval(
            c.replace("===", "==").replace("&& !", "and not ").replace("&&", "and"), {}, dict(ctx)
        )

    def step(self, conf, ev, ctx):
        p = self.enter(self.by[conf[-1].replace("/", "_", 1)])[: len(conf)]
        for st in reversed(p):
            for t in st.findall(f"{{{NS}}}transition"):
                if t.get("event") == ev and (
                    t.get("cond") is None or self.cond(t.get("cond"), ctx)
                ):
                    acts = [log.get("expr").strip("'") for log in t.findall(f"{{{NS}}}log")]
                    if t.get("target") is None:
                        return conf, acts
                    tgt = self.by[t.get("target")]
                    np = self.enter(tgt)
                    if tgt.tag == f"{{{NS}}}final" and len(np) > 1:
                        par = np[-2]
                        c2, a2 = self.step(self.conf(np[:-1]), f"done.state.{par.get('id')}", {})
                        return c2, acts + a2
                    return self.conf(np), acts
        return conf, []


def equivalent(
    flat: Machine,
    sub: Machine,
    as_flat: Callable[[tuple[str, ...]], str],
    events: Sequence[tuple[str, dict[str, Any]]],
    scx: ScxmlReader | None = None,
) -> tuple[int, str | None]:
    """Explore every reachable pair of states, under every event and guard case; any difference is
    returned."""
    seen = set()
    q = deque([(flat.start(), sub.start(), scx.start() if scx else None)])
    n = 0
    while q:
        f, s, x = q.popleft()
        if (f, s, x) in seen:
            continue
        seen.add((f, s, x))
        n += 1
        if as_flat(s) != f[0]:
            return n, f"state differs: flat {f[0]} vs sub-flow {s}"
        if scx and x != s:
            return n, f"SCXML reader {x} vs engine {s}"
        for e, ctx in events:
            f2, fa = flat.step(f, e, ctx)
            s2, sa = sub.step(s, e, ctx)
            if sorted(fa) != sorted(sa):
                return n, f"actions differ in {f[0]} on {e} {ctx}: {fa} vs {sa}"
            if scx:
                x2, xa = scx.step(x, e, ctx)
                if sorted(xa) != sorted(sa):
                    return n, f"SCXML actions differ in {s} on {e}: {xa} vs {sa}"
            else:
                x2 = None
            q.append((f2, s2, x2))
    return n, None


def scxml_valid(xml: str, xsd_dir: str) -> tuple[bool, str]:
    """The export validated against the W3C SCXML schema (§18)."""
    import os

    schema = etree.XMLSchema(etree.parse(os.path.join(xsd_dir, "scxml.xsd")))
    ok = schema.validate(etree.fromstring(xml.encode()))
    return ok, (str(schema.error_log.last_error) if not ok else "")


def process_events(
    dbs: Iterable[GrafeoDB], guard_cases: dict[str, list[dict[str, Any]]]
) -> list[tuple[str, dict[str, Any]]]:
    """Every event in the given process graphs, each with its declared guard cases (§7) — the
    alphabet for an equivalence check."""
    evs = sorted(
        {
            r["e"]
            for db in dbs
            for r in (
                [{"e": p.get("event")} for _, t, _, p in db.edges if t == "TRANSITION"]
                if isinstance(db, Graph)  # the reader's plain graph (req:18.scxml-reads-plain)
                else Q(db, "MATCH ()-[t:TRANSITION]->() RETURN DISTINCT t.event AS e")
            )
            if r["e"] != "done"
        }
    )
    return [(e, ctx) for e in evs for ctx in (guard_cases.get(e) or [{}])]
