"""§16: a process exported to SCXML, read back from the XML, and checked equivalent to its
flat original."""

from __future__ import annotations

from collections import deque
from collections.abc import Callable, Iterable, Sequence
from typing import TYPE_CHECKING, Any

from graphspec.engine.optional_imports import etree
from graphspec.engine.process.machine import Machine
from graphspec.engine.queries import Q
from graphspec.rules.plain_graph import Graph

if TYPE_CHECKING:
    from grafeo import GrafeoDB


# ── §16: a sub-flow process checked against its flat original, and its SCXML export ──
NS = "http://www.w3.org/2005/07/scxml"


def ecma(g: str) -> str:
    """A guard written as an ECMAScript condition, for SCXML: = as ===, and as &&, and not as !."""
    return g.replace(" = ", " === ").replace(" and not ", " && !").replace(" and ", " && ")


def to_scxml(db: Graph | GrafeoDB) -> str:
    """The process graph as W3C SCXML text: the loan flow's states, each sub-flow nested in the
    state it details, with their transitions and actions — built from the reader's plain graph
    (req:18.scxml-reads-plain), or from a Grafeo database a host asks for."""
    m = Machine(db)

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
