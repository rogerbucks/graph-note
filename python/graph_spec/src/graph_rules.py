#!/usr/bin/env python3
"""Runs the graph spec's checks on a plain in-memory graph — no database — for any system that can
run Python: types (§5), the flat projection (§18), certainty (§20), paths (§22), completeness
(§25), judgements (§23) and servings (§24).

Usage (in Python, from the repository root):
  import sys; sys.path.insert(0, 'python/graph_spec/src')
  import gql_profile as p, graph_rules as r
  s = p.Store(); s.apply(open('b.gql').read()); w = r.World.from_store(s); print(r.check(w))

Writes: nothing (library).

The rules once, over a plain graph, so they run where Grafeo does not. Standard library only. The
conformance suite runs them on the profile reader's graph and requires the same verdicts as
graph_spec.py's Grafeo-query versions on every case; the plain-JavaScript twin
(packages/graph-spec) follows this file function for function. A lens rule is evaluated when it has
the simple shape every lens here uses — buckets by comparing a node's own fields — and is otherwise
reported as needing an engine, never passed.
"""

import re
import json
import math
import hashlib
import datetime as dt

UTC = dt.timezone.utc


# ── the plain graph ──────────────────────────────────────────────────────────────────────────
class Graph:
    def __init__(self, nodes, edges):
        self.nodes = nodes  # {id: (frozenset(labels), {props})}
        self.edges = edges  # [(src id, type, dst id, {props})]
        self._out, self._in = {}, {}
        for e in edges:
            self._out.setdefault(e[0], []).append(e)
            self._in.setdefault(e[2], []).append(e)

    def labelled(self, label):
        return [i for i, (labels, _) in self.nodes.items() if label in labels]

    def p(self, i):
        return self.nodes[i][1] if i in self.nodes else {}

    def has(self, i, label):
        return i in self.nodes and label in self.nodes[i][0]

    def out(self, i, typ=None):
        return [e for e in self._out.get(i, []) if typ is None or e[1] == typ]

    def inc(self, i, typ=None):
        return [e for e in self._in.get(i, []) if typ is None or e[1] == typ]


class World:
    def __init__(self, graphs, schemas=None, named=None):
        self.graphs = graphs
        self.schemas = schemas or {}
        self.named = named or {}

    def schema_for(self, g):
        """The shared schema a graph names in its header, when it declares no types of its own
        (§5) — (name, Graph or None)."""
        name = self.named.get(g)
        return name, self.schemas.get(name)

    def __getitem__(self, g):
        return self.graphs[g]

    @staticmethod
    def from_store(store):
        out = {}
        for g, stored in store.graphs.items():
            byk = {k: n["props"]["id"] for k, n in stored["nodes"].items()}
            out[g] = Graph(
                {
                    n["props"]["id"]: (frozenset(n["labels"]), dict(n["props"]))
                    for n in stored["nodes"].values()
                },
                [(byk[s], t, byk[d], dict(p)) for s, t, d, p in stored["edges"]],
            )
        schemas = {
            name: out.pop(g) for name, g in getattr(store, "schemas", {}).items() if g in out
        }
        return World(out, schemas, dict(getattr(store, "named", {})))

    @staticmethod
    def from_rows(graphs):
        """{graph: (nodes [{'l': labels, 'p': props}],
        rels [{'s': src id, 'ty', 't': dst id, 'p'}])} — e.g. read out of any database."""
        return World(
            {
                g: Graph(
                    {n["p"]["id"]: (frozenset(n["l"]), dict(n["p"])) for n in node_rows},
                    [(r["s"], r["ty"], r["t"], dict(r["p"] or {})) for r in rel_rows],
                )
                for g, (node_rows, rel_rows) in graphs.items()
            }
        )


# ── canonical JSON and the hashes built on it ─────────────────────────────────────────────────
# (RFC 8785, for the value types the profile allows)
def _num(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if v != v or v in (float("inf"), float("-inf")):
        raise ValueError("RFC 8785 has no NaN or infinity")
    if v == int(v) and abs(v) < 1e21:
        return str(int(v))
    r = repr(v)
    if "e" in r:
        m, e = r.split("e")
        e = int(e)
        return f"{m}e{'+' if e > 0 else '-'}{abs(e)}"
    return r


def jcs(v):
    if v is None:
        return "null"
    if isinstance(v, (bool, int, float)):
        return _num(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(jcs(x) for x in v) + "]"
    if isinstance(v, dict):
        return (
            "{"
            + ",".join(
                json.dumps(k, ensure_ascii=False) + ":" + jcs(v[k])
                for k in sorted(v, key=lambda k: k.encode("utf-16-be"))
            )
            + "}"
        )
    raise TypeError(f"no canonical JSON for {type(v).__name__}")


def norm(v):
    if isinstance(v, dt.datetime):
        return (
            v.astimezone(UTC).replace(tzinfo=None) if v.tzinfo else v
        ).isoformat()  # an instant as its UTC time, as Grafeo returns it
    if isinstance(v, dt.date):
        return v.isoformat()
    return v


def hash16(obj):
    return hashlib.sha256(jcs(obj).encode()).hexdigest()[:16]


def basis_hash(props, reads):
    return hash16({k: norm(props.get(k)) for k in (x.strip() for x in reads.split(","))})


# ── §5 types ────────────────────────────────────────────────────────────────────────────────
# The spec's own vocabulary, built in because a checker must run with no documents to read it from.
# The spec's meta-schema declares it as data; the spec's trace check proves this copy,
# graph_spec.py's and graph-spec-check.js's equal it.
SPEC_SCHEMA = "graph-spec@2"  # @2, 6 Oct 2026: Cardinality and Coverage (§25)
SPEC_NODES = frozenset({"GraphMeta", "ElementType", "Meta", "Cardinality", "Coverage"})
SPEC_MARKERS = frozenset({"Meta"})  # marks a schema node; never types a node by itself
SPEC_EDGES = frozenset({"DECLARES"})


def declared_in(graph):
    """§5: the ElementTypes that type — those the graph's GraphMeta DECLARES."""
    return [
        graph.p(i)
        for i in graph.labelled("ElementType")
        if any(graph.has(e[0], "GraphMeta") for e in graph.inc(i, "DECLARES"))
    ]


def types(g, shared=None, builtin=True):
    # a graph's own schema, where it has one, or the shared one it names
    if g.labelled("ElementType"):
        element_types = declared_in(g)
    else:
        element_types = declared_in(shared) if shared is not None else []
    nodes, edges = (
        {t.get("name") for t in element_types if t.get("kind") == "node"},
        {t.get("name") for t in element_types if t.get("kind") == "edge"},
    )
    markers = {
        t.get("name") for t in element_types if t.get("kind") == "node" and t.get("marker") is True
    }
    if builtin:
        nodes, edges, markers = nodes | SPEC_NODES, edges | SPEC_EDGES, markers | SPEC_MARKERS
    return (
        nodes - markers,
        edges,
        [
            t
            for t in element_types
            if t.get("kind") == "edge" and not (t.get("reverse_name") and t.get("reading"))
        ],
    )


def typed(g, shared=None, builtin=True):
    nodes, edges, unreversed = types(g, shared, builtin)
    return (
        not unreversed
        and all(labels & nodes for labels, _ in g.nodes.values())
        and {e[1] for e in g.edges} <= edges
    )


def untyped(g, shared=None, builtin=True):
    nodes, edges, unreversed = types(g, shared, builtin)
    return (
        sorted({x for labels, _ in g.nodes.values() if not labels & nodes for x in labels}),
        sorted({e[1] for e in g.edges} - edges),
        sorted(t["name"] for t in unreversed),
    )


# ── §18 the flat projection ─────────────────────────────────────────────────────────────────────
# One block per node; rebuilt by the profile reader, it must give back the same graph.
# Instants are projected at UTC+10, with no summer time — as the JavaScript twin.
PROJECTION_TZ = dt.timezone(dt.timedelta(hours=10))


def _iso(v):
    if isinstance(v, dt.datetime):
        return (v if v.tzinfo else v.replace(tzinfo=UTC)).astimezone(PROJECTION_TZ).isoformat()
    return v.isoformat() if isinstance(v, dt.date) else v


def project(g):
    blocks, rels = {}, []
    for i in sorted(g.nodes):
        labels, p = g.nodes[i]
        for k, v in p.items():
            if isinstance(v, list):
                raise ValueError(
                    f"refused: §18 — {i}.{k} is a list, "
                    "and a list in the flat projection means relationships"
                )
            if k == "type":
                raise ValueError(
                    f"refused: §18 — {i}.type is reserved: the flat projection uses type "
                    "for a node's labels; rename the property"
                )
        blocks[i] = {"id": i, "type": sorted(labels)} | {
            k: _iso(v) for k, v in sorted(p.items()) if k != "id" and v is not None
        }
    for s, t, d, p in g.edges:
        if p:
            rels.append(
                {"from": s, "relationship": t, "to": d}
                | {k: _iso(v) for k, v in sorted(p.items()) if v is not None}
            )
            continue
        blocks[s].setdefault(t.lower(), []).append(d)
    for b in blocks.values():
        for k, v in b.items():
            if isinstance(v, list) and k != "type":
                v.sort()
    return blocks, sorted(rels, key=jcs)  # by canonical text, so every language orders them alike


def _gql(v):
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str) and re.fullmatch(r"\d{4}-\d\d-\d\dT[\d:]+[+-]\d\d:\d\d", v):
        return f"DATETIME '{v}'"
    if isinstance(v, str) and re.fullmatch(r"\d{4}-\d\d-\d\d", v):
        return f"DATE '{v}'"
    return "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"


def rebuild(name, blocks, rels):
    """GQL from the projection alone — a profile data block."""
    keys = sorted(
        {k for b in blocks.values() for k, v in b.items() if isinstance(v, list) and k != "type"}
    )
    var = {i: f"n{k}" for k, i in enumerate(blocks)}
    lines = []
    for i, b in blocks.items():
        lines.append(
            f" ({var[i]}:{':'.join(b['type'])} {{"
            + ", ".join(
                f"{k}: {_gql(v)}"
                for k, v in b.items()
                if k != "type" and not (k in keys and isinstance(v, list))
            )
            + "})"
        )
    for i, b in blocks.items():
        for k in keys:
            for t in b[k] if isinstance(b.get(k), list) else []:
                lines.append(f" ({var[i]})-[:{k.upper()}]->({var[t]})")
    for e in rels:
        props = ", ".join(
            f"{k}: {_gql(v)}" for k, v in e.items() if k not in ("from", "relationship", "to")
        )
        lines.append(
            f" ({var[e['from']]})-[:{e['relationship']}"
            + (f" {{{props}}}" if props else "")
            + f"]->({var[e['to']]})"
        )
    return f"// graph: {name}\nINSERT\n" + ",\n".join(lines)


def projects_back(g, name):
    if not g.nodes and not g.edges:
        return True  # nothing to project
    import gql_profile

    blocks, rels = project(g)
    blocks, rels = (
        json.loads(json.dumps(blocks)),
        json.loads(json.dumps(rels)),
    )  # through text, as a target system would hold it
    s = gql_profile.Store()
    s.apply(rebuild(name, blocks, rels))
    return canon(World.from_store(s)[name]) == canon(g)


def _cnorm(v):
    if isinstance(v, dt.datetime):
        return (v.astimezone(UTC) if v.tzinfo else v.replace(tzinfo=UTC)).isoformat()
    return v.isoformat() if isinstance(v, dt.date) else v


def canon(g):
    """sha-256 of the RFC 8785 JSON of the graph — nodes by id, relationships by their own
    canonical text. The same in every language."""
    body = sorted(
        [
            [sorted(labels), {k: _cnorm(v) for k, v in p.items() if v is not None}]
            for labels, p in g.nodes.values()
        ],
        key=lambda x: x[1]["id"],
    ) + sorted(
        [
            [s, t, d, {k: _cnorm(v) for k, v in p.items() if v is not None}]
            for s, t, d, p in g.edges
        ],
        key=jcs,
    )
    return hashlib.sha256(jcs(body).encode()).hexdigest()


# ── §20 certainty ──────────────────────────────────────────────────────────────────────────
LIKELIHOOD = [
    "almost-no-chance",
    "very-unlikely",
    "unlikely",
    "even-chance",
    "likely",
    "very-likely",
    "almost-certain",
]  # ICD 203, in order
CONFIDENCE = ["low", "moderate", "high"]
_BANDS = [
    ("almost-no-chance", 0, 5),
    ("very-unlikely", 5, 20),
    ("unlikely", 20, 45),
    ("even-chance", 45, 55),
    ("likely", 55, 80),
    ("very-likely", 80, 95),
    ("almost-certain", 95, 100),
]
RANGE = {t: (lo, hi) for t, lo, hi in _BANDS} | {
    "almost-no-chance": (1, 5),
    "almost-certain": (95, 99),
    "cannot-judge": (0, 100),
}


def _word_lo(x):
    return next(t for t, lo, hi in _BANDS if lo <= x < hi or (x == 100 and hi == 100))


def _word_hi(x):
    return next(t for t, lo, hi in _BANDS if lo < x <= hi or (x == 0 and lo == 0))


def words(iv):
    lo, hi = iv
    if lo <= 1 and hi >= 99:
        return "cannot judge"
    a, b = _word_lo(lo), _word_hi(hi)
    return a if a == b else f"{a} to {b}"


def both(a, b, dep="unknown"):
    return (
        (a[0] * b[0] / 100, a[1] * b[1] / 100)
        if dep == "independent"
        else (max(0, a[0] + b[0] - 100), min(a[1], b[1]))
    )


def wilson(k, n, z=1.96):
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (math.floor((c - h) * 1000) / 10, math.ceil((c + h) * 1000) / 10)


def verdict(iv, band):
    lo, hi = iv
    blo, bhi = map(float, band)
    if lo >= blo and hi <= bhi:
        return "calibrated"
    if hi < blo:
        return "over-confident"
    if lo > bhi:
        return "under-confident"
    return "cannot judge yet"


def corroborate(ranges, base=50.0):
    def post(rs):
        b = base / (100 - base)
        o = b
        for r in rs:
            o *= (r / (100 - r)) / b
        return 100 * o / (1 + o)

    return (
        math.floor(post([r[0] for r in ranges]) * 10) / 10,
        math.ceil(post([r[1] for r in ranges]) * 10) / 10,
    )


def span(likelihood, lt=None):
    if likelihood in RANGE and (lt or likelihood) in RANGE:
        return (RANGE[likelihood][0], RANGE[lt or likelihood][1])
    return None


def band_rank(w):
    return LIKELIHOOD.index(w) if w in LIKELIHOOD else -1


def latest_assessment(g):
    best = {}
    for a in g.labelled("Assessment"):
        for _, _, c, _ in g.out(a, "ASSESSES"):
            if not g.has(c, "Claim"):
                continue
            at = g.p(a).get("at")
            if c not in best or at > best[c][0]:
                best[c] = (at, g.p(a).get("likelihood"))
    return {c: v[1] for c, v in best.items()}


def _sources(g, c, typ):
    return {
        s
        for _, _, e, _ in g.out(c, typ)
        if g.has(e, "Evidence")
        for _, _, s, _ in g.out(e, "FROM")
    }


def confidence_from_evidence(g):
    out = {}
    for c in g.labelled("Claim"):
        if g.p(c).get("rule") is not None:
            continue
        s, k = _sources(g, c, "SUPPORTED_BY"), _sources(g, c, "CONTRADICTED_BY")
        out[c] = "high" if len(s) >= 2 and not k else "moderate" if len(s) > len(k) else "low"
    return out


def claim_status(g):
    conf = {c for c in g.labelled("Claim") if g.inc(c, "CONFIRMS")}
    ref = {c for c in g.labelled("Claim") if g.inc(c, "REFUTES")}
    return {
        c: "confirmed" if c in conf else "refuted" if c in ref else "open"
        for c in g.labelled("Claim")
    }


def derived_ranges(g):
    out = {}
    for d in g.labelled("Claim"):
        rs = [g.p(c) for _, _, c, _ in g.out(d, "WAS_DERIVED_FROM") if g.has(c, "Claim")]
        if not rs or any(span(r.get("likelihood"), r.get("likelihood_to")) is None for r in rs):
            continue
        iv = span(rs[0].get("likelihood"), rs[0].get("likelihood_to"))
        for r in rs[1:]:
            iv = both(iv, span(r.get("likelihood"), r.get("likelihood_to")))
        w = words(iv).split(" to ")
        out[d] = {
            "likelihood": w[0],
            "likelihood_to": w[-1],
            "low_pct": float(iv[0]),
            "high_pct": float(iv[1]),
            "confidence": min((r.get("confidence") for r in rs), key=CONFIDENCE.index),
        }
    return out


def settled(g):
    out = {}
    for f in g.labelled("Finding"):
        for _, ty, c, _ in g.out(f):
            if ty in ("CONFIRMS", "REFUTES") and g.has(c, "Claim"):
                out[c] = (ty == "CONFIRMS", g.p(f).get("recorded_at"))
    return out


def calibration(g, before_settlement=True):
    outcomes = settled(g)
    last = {}
    for a in g.labelled("Assessment"):
        for _, _, c, _ in g.out(a, "ASSESSES"):
            if not g.has(c, "Claim"):
                continue
            for _, _, x, _ in g.out(a, "BY"):
                w, t = g.p(a).get("likelihood"), g.p(a).get("recorded_at")
                if c not in outcomes or (before_settlement and t >= outcomes[c][1]):
                    continue
                if (x, c) not in last or t > last[(x, c)][1]:
                    last[(x, c)] = (w, t)
    tally = {}
    for (x, c), (w, _) in last.items():
        n, k = tally.get((x, w), (0, 0))
        tally[(x, w)] = (n + 1, k + outcomes[c][0])
    return {
        xw: {
            "settled": n,
            "came_true": k,
            "range": wilson(k, n),
            "verdict": verdict(wilson(k, n), RANGE[xw[1]]),
        }
        for xw, (n, k) in tally.items()
    }


def reliability(g):
    outcomes = settled(g)
    rec = {}
    for c in g.labelled("Claim"):
        if c in outcomes:
            for s in _sources(g, c, "SUPPORTED_BY"):
                rec.setdefault(s, set()).add(c)
    return {
        s: {
            "backed": len(cs),
            "came_true": sum(outcomes[c][0] for c in cs),
            "range": wilson(sum(outcomes[c][0] for c in cs), len(cs)),
        }
        for s, cs in rec.items()
    }


def corroboration(g, one_vote_per_source=True):
    reliabilities = reliability(g)
    out = {}
    for c in g.labelled("Claim"):
        if g.p(c).get("rule") != "rule:corroborate@1":
            continue
        rows = [
            s
            for _, _, e, _ in g.out(c, "SUPPORTED_BY")
            if g.has(e, "Evidence")
            for _, _, s, _ in g.out(e, "FROM")
        ]
        srcs = sorted(set(rows)) if one_vote_per_source else rows
        out[c] = corroborate([reliabilities[s]["range"] for s in srcs], g.p(c).get("base_pct"))
    return out


def section20(g, switches=frozenset()):
    out = []
    stored = {c: g.p(c) for c in g.labelled("Claim")}
    if not stored:
        return out
    bands = {g.p(b).get("term") for b in g.labelled("LikelihoodBand")}
    used = (
        {p.get("likelihood") for p in stored.values()}
        | {p.get("likelihood_to") for p in stored.values() if p.get("likelihood_to")}
        | {g.p(a).get("likelihood") for a in g.labelled("Assessment")}
    )
    out.append(
        (
            "§20: every likelihood is a band declared in the graph",
            used <= bands,
            f"undeclared {sorted(x for x in used - bands if x)}",
        )
    )
    la = latest_assessment(g)
    bad = {
        c: (stored[c].get("likelihood"), v)
        for c, v in la.items()
        if stored[c].get("likelihood") != v
    }
    out.append(("§20: each claim's likelihood is its latest assessment", not bad, str(bad)))
    cf = confidence_from_evidence(g)
    bad = {
        c: (stored[c].get("confidence"), v)
        for c, v in cf.items()
        if stored[c].get("confidence") != v and stored[c].get("rule") is None
    }
    out.append(("§20: each claim's confidence is counted from its evidence", not bad, str(bad)))
    st = claim_status(g)
    bad = {c: (stored[c].get("status"), v) for c, v in st.items() if stored[c].get("status") != v}
    out.append(
        ("§20: each claim's status follows its confirmations and refutations", not bad, str(bad))
    )
    dv = derived_ranges(g)
    bad = {
        d: v
        for d, v in dv.items()
        if any(
            stored[d].get(k) != x
            for k, x in v.items()
            if not (k == "likelihood_to" and x == v["likelihood"] and stored[d].get(k) is None)
        )
    }
    if dv:
        out.append(
            (
                "§20: each derived claim's range and confidence equal rule:combine@1 "
                "on its inputs",
                not bad,
                str(bad),
            )
        )
    unassessed = sorted(set(stored) - set(la) - {c for c, p in stored.items() if p.get("rule")})
    out.append(
        (
            "§20: every claim not derived by a rule has an assessment",
            not unassessed,
            str(unassessed),
        )
    )
    if g.labelled("Calibration"):
        cal = calibration(g, "before-settlement" not in switches)
        rows = {}
        for k in g.labelled("Calibration"):
            p = g.p(k)
            for _, _, x, _ in g.out(k, "OF"):
                rows[(x, p.get("term"))] = (
                    p.get("settled"),
                    p.get("came_true"),
                    (p.get("low_pct"), p.get("high_pct")),
                    p.get("outcome"),
                )
        bad = sorted(
            k
            for k in set(rows) | set(cal)
            if k not in rows
            or k not in cal
            or rows[k]
            != (cal[k]["settled"], cal[k]["came_true"], cal[k]["range"], cal[k]["verdict"])
        )
        out.append(
            (
                "§20: every calibration record equals rule:calibration@1 on the settled claims",
                not bad,
                str(bad),
            )
        )
    rel = reliability(g)
    rows = {s: g.p(s) for s in g.nodes if g.p(s).get("backed_settled") is not None}
    if rows:
        bad = sorted(
            s
            for s, p in rows.items()
            if s not in rel
            or (
                p.get("backed_settled"),
                p.get("backed_true"),
                (p.get("reliability_low_pct"), p.get("reliability_high_pct")),
            )
            != (rel[s]["backed"], rel[s]["came_true"], rel[s]["range"])
        )
        out.append(
            ("§20: every source's reliability equals rule:source-reliability@1", not bad, str(bad))
        )
    cor = corroboration(g, "one-vote-per-source" not in switches)
    if cor:
        bad = {
            c: v
            for c, v in cor.items()
            if (stored[c].get("low_pct"), stored[c].get("high_pct")) != v
        }
        out.append(
            (
                "§20: every corroborated claim's range equals rule:corroborate@1, "
                "one vote per source",
                not bad,
                str(bad),
            )
        )
    return out


# ── §22 paths ─────────────────────────────────────────────────────────────────────────────
def path_steps(g, pid):
    return [
        {
            "seq": p.get("seq"),
            "id": x,
            "altitude": g.p(x).get("altitude"),
            "labels": sorted(g.nodes[x][0]),
        }
        for _, _, x, p in sorted(g.out(pid, "STEP"), key=lambda e: e[3].get("seq") or 0)
        if g.has(pid, "Path")
    ]


def view_at(g, pid, level, _seen=None):
    seen = (_seen or set()) | {pid}
    out = []
    for r in path_steps(g, pid):
        if "Path" in r["labels"] and (r["altitude"] or 0) > level and r["id"] not in seen:
            out += view_at(g, r["id"], level, seen)
        else:
            out.append(r["id"])
    return out


def below(g, top, depth=8):
    """Everything a path steps to, at any depth up to `depth` — what folds into it."""
    seen, frontier = set(), [top]
    for _ in range(depth):
        frontier = [x for f in frontier for _, _, x, _ in g.out(f, "STEP") if x not in seen]
        seen |= set(frontier)
        if not frontier:
            break
    return seen


def lift(g, xid, depth=8):
    ups, frontier = set(), [xid]
    for _ in range(depth):
        frontier = [
            s
            for f in frontier
            for s, _, _, _ in g.inc(f, "STEP")
            if g.has(s, "Path") and s not in ups
        ]
        ups |= set(frontier)
        if not frontier:
            break
    return [p for p in sorted(ups, key=lambda p: (g.p(p).get("altitude") or 0, p))]


def paths_rules(g):
    out = []
    paths = {p: g.p(p) for p in g.labelled("Path")}
    if not paths:
        return out
    bad = [
        {"a": s, "b": d}
        for s in paths
        for _, _, d, _ in g.out(s, "STEP")
        if g.has(d, "Path") and (g.p(d).get("altitude") or 0) >= (paths[s].get("altitude") or 0)
    ]
    out.append(
        (
            "§22 rule 1: altitude falls at every step into a path — no path contains itself",
            not bad,
            str(bad),
        )
    )
    bad = sorted(
        p
        for p in paths
        if sorted(e[3].get("seq") for e in g.out(p, "STEP"))
        != list(range(1, len(g.out(p, "STEP")) + 1))
    )
    out.append(("§22 rule 2: each path's steps are numbered 1 to n", not bad, str(bad)))
    bad = sorted(
        p
        for p in paths
        if not view_at(g, p, 0)
        or any({"Path", "Concept"} & set(g.nodes[x][0]) for x in view_at(g, p, 0) if x in g.nodes)
    )
    out.append(("§22 rule 3: every path grounds out in facts", not bad, str(bad)))
    bad = []
    for p, r in paths.items():
        o = r.get("ordered_by")
        if o:
            facts = [g.p(x)[o] for x in view_at(g, p, 0) if g.p(x).get(o) is not None]
            if any(a > b for a, b in zip(facts, facts[1:])):
                bad.append(p)
    out.append(("§22 rule 4: a path that declares an order keeps it", not bad, str(bad)))
    return out


# ── §15 lens rules — the simple shape, evaluated without an engine ───────────────────────────────
LENS = re.compile(
    r"^\s*MATCH \((\w+):(\w+)\) RETURN \1\.id AS id, CASE (.*) ELSE '([^']*)' END AS grp\s*$", re.S
)


def lens_buckets(g, rule):
    """{id: bucket} for a lens rule of the shape every lens here uses; None if the rule needs an
    engine."""
    m = LENS.match(rule or "")
    if not m:
        return None
    var, label, whens, other = m.groups()
    arms = re.findall(r"WHEN (.*?) THEN '([^']*)'\s*", whens)
    if " ".join(f"WHEN {c} THEN '{b}'" for c, b in arms) != re.sub(r"\s+", " ", whens.strip()):
        return None

    def test(cond, p):
        for part in re.split(r"\s+AND\s+", cond):
            t = re.fullmatch(
                rf"{var}\.(\w+)\s*(<=|>=|<>|=|<|>)\s*('([^']*)'|-?\d+(?:\.\d+)?)", part.strip()
            )
            if not t:
                raise ValueError("needs an engine")
            k, op, raw, s = t.groups()
            a, b = p.get(k), (s if s is not None else float(raw) if "." in raw else int(raw))
            if (
                a is None
                or not {
                    "=": a == b,
                    "<>": a != b,
                    "<": a < b,
                    ">": a > b,
                    "<=": a <= b,
                    ">=": a >= b,
                }[op]
            ):
                return False
        return True

    try:
        return {i: next((b for c, b in arms if test(c, g.p(i))), other) for i in g.labelled(label)}
    except (ValueError, TypeError):
        return None


# ── §23 judgements ───────────────────────────────────────────────────────────────────────────
JUDGEMENT_EDGES = ("RESTS_ON", "ASSUMES", "UNDER")


def resolve(w, ref):
    """A Ref followed into the graph it names: (props or None, labels, superseded?)."""
    g = w.graphs.get(ref["graph"])
    if g is None or ref["ref"] not in g.nodes:
        return None, set(), False
    return g.p(ref["ref"]), set(g.nodes[ref["ref"]][0]), bool(g.inc(ref["ref"], "SUPERSEDES"))


def basis(w, jg, d):
    g = w[jg]
    return [
        {"ty": t, "e": p, "ref": g.p(r).get("ref"), "graph": g.p(r).get("graph"), "rid": r}
        for _, t, r, p in g.out(d)
        if g.has(r, "Ref")
    ]


def current_decisions(w, jg):
    g = w[jg]
    return sorted(
        d
        for d in g.labelled("Decision")
        if not any(g.has(s, "Decision") for s, _, _, _ in g.inc(d, "SUPERSEDES"))
    )


def judgement_hash(w, jg, d):
    g = w[jg]
    p = g.p(d)
    out = sorted(
        [[t, x, {k: norm(v) for k, v in sorted(e.items())}] for _, t, x, e in g.out(d)], key=jcs
    )
    return hash16(
        {
            "decision": {k: norm(v) for k, v in p.items() if k not in ("content_hash", "review")},
            "edges": out,
        }
    )


def review(w, jg, switches=frozenset()):
    """rule:judgement-review@1. A lens pin whose rule needs an engine gives the reason
    'needs-engine' — never silence."""
    out = {}
    for d in current_decisions(w, jg):
        why = set()
        for b in basis(w, jg, d):
            if b["ty"] not in JUDGEMENT_EDGES:
                continue
            p, _, sup = resolve(w, b)
            if p is None:
                continue
            if b["ty"] == "RESTS_ON" and b["e"].get("lens"):
                if "lens-pins" in switches:
                    continue
                lg = w[b["graph"]]
                lz = next((x for x in lg.labelled("Lens") if x == b["e"]["lens"]), None)
                got = lens_buckets(lg, lg.p(lz).get("rule_gql")) if lz else None
                if got is None:
                    why.add("needs-engine")
                elif got.get(b["ref"]) != b["e"].get("bucket"):
                    why.add("basis-moved")
            elif b["ty"] == "RESTS_ON" and (
                sup or basis_hash(p, b["e"]["reads"]) != b["e"]["hash"]
            ):
                why.add("basis-moved")
            if b["ty"] == "ASSUMES" and (
                p.get("status") == "refuted"
                or (
                    "assumption-bands" not in switches
                    and band_rank(p.get("likelihood")) < band_rank(b["e"]["likelihood_then"])
                )
            ):
                why.add("assumption-weakened")
            if b["ty"] == "UNDER" and sup:
                why.add("shape-changed")
        out[d] = sorted(why)
    return out


def why_layer(w, jg, dg, top, level, switches=frozenset()):
    g = w[dg]
    seen = {top} | set(view_at(g, top, level))
    if "why-folded" not in switches:
        seen |= below(g, top)
    return sorted(
        {
            d
            for d in current_decisions(w, jg)
            for b in basis(w, jg, d)
            if b["ty"] in ("RESTS_ON", "ASSUMES") and b["graph"] == dg and b["ref"] in seen
        }
    )


def judgements_rules(w, jg):
    g = w[jg]
    out = []
    ds = {d: g.p(d) for d in g.labelled("Decision")}
    bad = []
    for d in ds:
        who = [resolve(w, b)[1] for b in basis(w, jg, d) if b["ty"] == "DECIDED_BY"]
        if not who or any("Person" not in labels for labels in who):
            bad.append((d, [sorted(labels) for labels in who]))
    out.append(
        ("§23 rule 1: every judgement is decided by a person, never a model", not bad, str(bad))
    )
    bad = []
    for d, r in ds.items():
        for b in basis(w, jg, d):
            if b["ty"] != "RESTS_ON":
                continue
            p = resolve(w, b)[0]
            e = b["e"]
            said = (e.get("hash") and e.get("reads")) or (e.get("lens") and e.get("bucket"))
            if p is None or not said or not e.get("as_of") or e["as_of"] > r.get("at"):
                bad.append((d, b["ref"]))
    out.append(
        (
            "§23 rule 2: every basis pin resolves, says what it read (or which lens bucket), "
            "and was read no later than the decision",
            not bad,
            str(bad),
        )
    )
    bad = [
        (d, b["ref"])
        for d in ds
        for b in basis(w, jg, d)
        if b["ty"] == "ASSUMES" and "Claim" not in resolve(w, b)[1]
    ]
    out.append(("§23 rule 3: every assumption is a claim (§20), never a fact", not bad, str(bad)))
    rv = review(w, jg)
    bad = {
        d: (r.get("review"), rv.get(d))
        for d, r in ds.items()
        if r.get("review") is not None and r["review"] != (", ".join(rv.get(d, [])) or "none")
    }
    out.append(("§23 rule 4: a stored review equals rule:judgement-review@1", not bad, str(bad)))
    bad = [
        (x, r)
        for x, other in w.graphs.items()
        if x != jg
        for r in other.labelled("Ref")
        if other.p(r).get("graph") == jg
    ]
    out.append(
        (
            "§23 rule 5: nothing in a data graph links into the judgement graph — "
            "judgements stay out of view",
            not bad,
            str(bad),
        )
    )
    bad = []
    for p in g.labelled("Proposal"):
        ms = [
            g.p(m)
            for _, _, a, _ in g.out(p, "WAS_GENERATED_BY")
            if g.has(a, "Activity")
            for _, _, m, _ in g.out(a, "ASSOCIATED_WITH")
            if g.has(m, "Ref")
        ]
        if not ms or any("Model" not in resolve(w, m)[1] for m in ms):
            bad.append(p)
    out.append(
        (
            "§23 rule 6: every proposal names the activity and the model that generated it",
            not bad,
            str(sorted(bad)),
        )
    )
    bad = sorted(d for d, r in ds.items() if r.get("content_hash") != judgement_hash(w, jg, d))
    out.append(
        (
            "§23 rule 7: no judgement is edited — each content hash, covering its pins, "
            "still matches (rule:judgement-hash@1)",
            not bad,
            str(bad),
        )
    )
    return out


# ── §24 servings ────────────────────────────────────────────────────────────────────────────
def may_serve(kind, cls, conditions_met, matrix):
    v = matrix.get(kind, {}).get(cls)
    return v == "yes" or (v == "conditional" and bool(conditions_met))


def served_rules(w, jg, matrix):
    g = w[jg]
    out = []
    if not g.labelled("Serving") and not g.labelled("Proposal"):
        return out
    served = {}
    for p in g.labelled("Proposal"):
        for _, _, s, _ in g.out(p, "USED"):
            if g.has(s, "Serving"):
                for _, _, x, e in g.out(s, "SERVED"):
                    served.setdefault(p, {})[x] = e
    bad = []
    for p in g.labelled("Proposal"):
        for _, _, x, e in g.out(p, "RESTS_ON"):
            if not g.has(x, "Ref"):
                continue
            s = served.get(p, {}).get(x)
            if not s or any(s.get(k) != e.get(k) for k in ("reads", "hash", "as_of")):
                bad.append((p, x))
    out.append(
        (
            "§24 H3 rule 1: every pin of a proposal was served to its model — "
            "same item, same properties, same hash, same time",
            not bad,
            str(bad),
        )
    )
    bad = [
        (s, x, e.get("classification"), g.p(s).get("consumer_kind"))
        for s in g.labelled("Serving")
        for _, _, x, e in g.out(s, "SERVED")
        if not may_serve(
            g.p(s).get("consumer_kind"),
            e.get("classification"),
            g.p(s).get("conditions_met"),
            matrix,
        )
    ]
    out.append(
        (
            "§24 H3 rule 2: no serving crossed its classification — "
            "the consumer was allowed every item served",
            not bad,
            str(bad),
        )
    )
    bad = []
    for p in g.labelled("Proposal"):
        ms = {
            g.p(m).get("ref"): g.p(m).get("graph")
            for _, _, a, _ in g.out(p, "WAS_GENERATED_BY")
            if g.has(a, "Activity")
            for _, _, m, _ in g.out(a, "ASSOCIATED_WITH")
            if g.has(m, "Ref")
        }
        if any(
            "Model" in resolve(w, {"ref": r, "graph": gr})[1] for r, gr in ms.items()
        ) and not any(g.has(s, "Serving") for _, _, s, _ in g.out(p, "USED")):
            bad.append(p)
    out.append(
        (
            "§24 H3 rule 4: every proposal a model generated used a serving — "
            "it drafted from what it was shown",
            not bad,
            str(sorted(bad)),
        )
    )
    return out


def is_draft(w, name):
    """A graph with no schema — none of its own and none named in its header — is a draft (§5,
    decided 6 Oct 2026): its kinds and relationship types are worked out from the data until it is
    locked."""
    return not w[name].labelled("ElementType") and not w.named.get(name)


def drafted(g):
    """A draft's kinds and relationship types, worked out from the data — (kinds, types), each
    sorted."""
    return sorted({x for labels, _ in g.nodes.values() for x in labels - SPEC_NODES}), sorted(
        {e[1] for e in g.edges}
    )


def _lev(a, b):
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, y in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (x != y))
    return row[-1]


def near_duplicates(names):
    """Pairs of names that are probably one name misspelt — FAVOURS and FAVORS, Option and Options:
    one edit apart, or two when both are eight letters or more, ignoring case and underscores. What
    a draft has instead of a schema to catch typos."""

    def n(x):
        return x.replace("_", "").lower()

    return [
        (a, b)
        for i, a in enumerate(names)
        for b in names[i + 1 :]
        if _lev(n(a), n(b)) <= (2 if min(len(n(a)), len(n(b))) >= 8 else 1)
    ]


def check(w, name, matrix=None, switches=frozenset()):
    """Every rule that applies to graph `name`, as [(label, ok, detail)] — the portable equivalent
    of the suite's per-graph checks."""
    g = w[name]
    sname, shared = w.schema_for(name) if not g.labelled("ElementType") else (None, None)
    if is_draft(w, name):
        kinds, type_names = drafted(g)
        near = near_duplicates(kinds) + near_duplicates(type_names)
        t5 = (
            "§5: a draft's kinds and relationship types hold no near-duplicates",
            not near,
            "; ".join(
                f"{a} and {b} look like one name misspelt — "
                "correct one, or lock the graph to declare both"
                for a, b in near
            )
            or f"a draft: {len(kinds)} kinds, {len(type_names)} relationship types, "
            "worked out from the data — lock it to declare them",
        )
    else:
        t5 = (
            "§5: every element has a declared type",
            typed(g, shared),
            ""
            if shared is not None or not sname
            else f"its header names schema {sname}, and no schema document for it was given — "
            "supply it with the graph",
        )
    try:
        back, why18 = projects_back(g, name), ""
    except ValueError as e:
        back, why18 = False, str(e)
    out = [t5, ("§18: the flat projection rebuilds the graph", back, why18)]
    out += section20(g, switches) + paths_rules(g)
    if is_judgement_graph(g):
        out += judgements_rules(w, name) + (
            served_rules(w, name, matrix) if matrix is not None else []
        )
    return out


def is_judgement_graph(g):
    """§23 applies to a graph that declares the judgement basis (RESTS_ON), or holds proposals or
    servings — not to every graph with a decision in it."""
    return (
        any(g.p(t).get("name") == "RESTS_ON" for t in g.labelled("ElementType"))
        or bool(g.labelled("Proposal"))
        or bool(g.labelled("Serving"))
    )


# ── §25 completeness — what a graph says it must contain; reported, never refused ────────────────
# Counts (Cardinality, after SHACL sh:minCount/sh:maxCount) and grids (Coverage), declared in the
# graph itself; a Deferred parks a gap on purpose. The JavaScript twin, completeness() in
# graph-spec-check.js, must give the identical report.
CARD_NEEDS = ("kind", "relationship", "direction")
COV_NEEDS = ("rows", "columns", "of", "row_link", "column_link", "excused_by")


def _day(v):
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    return str(v)[:10] if v else ""


def _parked_state(g, ds, today):
    """A gap parked by several Deferreds is overdue only when every one is past its revisit_by."""
    return (
        "overdue"
        if all(
            _day(g.p(d).get("revisit_by")) and _day(g.p(d).get("revisit_by")) < today for d in ds
        )
        else "deferred"
    )


def completeness(g, today=None):
    """{'rules': one entry per Cardinality and Coverage, by id; 'deferred_malformed': Deferreds
    that do not say what and why}."""
    today = today or dt.date.today().isoformat()
    rules = []
    for r in sorted(g.labelled("Cardinality")):
        p = g.p(r)
        lack = [k for k in CARD_NEEDS if p.get(k) in (None, "")] + (
            [] if p.get("min") is not None or p.get("max") is not None else ["min or max"]
        )
        if not lack and p["direction"] not in ("out", "in"):
            lack = ["direction 'out' or 'in'"]
        e = {
            "rule": r,
            "kind": "cardinality",
            "says": p.get("says", ""),
            "counted": 0,
            "met": 0,
            "excused": 0,
            "missing": [],
            "deferred": [],
            "overdue": [],
            "malformed": ("a Cardinality must carry " + ", ".join(lack)) if lack else "",
        }
        if not lack:
            alts, mn, mx, way = (
                [t.strip() for t in str(p["relationship"]).split("|")],
                p.get("min"),
                p.get("max"),
                p["direction"],
            )
            parked = {}
            for d in g.labelled("Deferred"):
                if g.p(d).get("rule") == r:
                    for x in g.out(d, "DEFERS"):
                        parked.setdefault(x[2], []).append(d)
            for i in sorted(g.labelled(p["kind"])):
                n = sum(len(g.out(i, t) if way == "out" else g.inc(i, t)) for t in alts)
                e["counted"] += 1
                low, high = mn is not None and n < mn, mx is not None and n > mx
                if not (low or high):
                    e["met"] += 1
                    continue
                if i in parked:
                    e[_parked_state(g, parked[i], today)].append(i)
                    continue
                fix = (
                    f"add a {p['relationship']} link ({way}): it has {_num(n)}, "
                    f"needs at least {_num(mn)}; or park it with a Deferred whose rule is {r}"
                    if low
                    else f"remove {_num(n - mx)} of its {p['relationship']} links ({way}): "
                    f"it has {_num(n)}, allows at most {_num(mx)}"
                )
                e["missing"].append({"at": i, "found": n, "fix": fix})
        rules.append(e)
    for r in sorted(g.labelled("Coverage")):
        p = g.p(r)
        lack = [k for k in COV_NEEDS if p.get(k) in (None, "")]
        e = {
            "rule": r,
            "kind": "coverage",
            "says": p.get("says", ""),
            "counted": 0,
            "met": 0,
            "excused": 0,
            "missing": [],
            "deferred": [],
            "overdue": [],
            "malformed": ("a Coverage must carry " + ", ".join(lack)) if lack else "",
        }
        if not lack:

            def pairs(x):
                return {
                    (a[2], b[2])
                    for a in g.out(x, p["row_link"])
                    for b in g.out(x, p["column_link"])
                }

            covered = (
                set().union(*[pairs(x) for x in g.labelled(p["of"])])
                if g.labelled(p["of"])
                else set()
            )
            parked = {}
            for d in g.labelled("Deferred"):
                for k in pairs(d):
                    parked.setdefault(k, []).append(d)
            for a in sorted(g.labelled(p["rows"])):
                for b in sorted(g.labelled(p["columns"])):
                    e["counted"] += 1
                    at = f"{a} × {b}"
                    if (a, b) in covered:
                        e["met"] += 1
                        continue
                    ex = [x for x in g.out(a, p["excused_by"]) if x[2] == b]
                    if any(str(x[3].get("reason") or "").strip() for x in ex):
                        e["excused"] += 1
                        continue
                    if (a, b) in parked:
                        e[_parked_state(g, parked[(a, b)], today)].append(at)
                        continue
                    fix = (
                        f"give the {p['excused_by']} from {a} to {b} a reason"
                        if ex
                        else f"add a {p['of']} that is {p['row_link']} {a} and "
                        f"{p['column_link']} {b}; or excuse the pairing with {p['excused_by']} "
                        "and a reason; or park it with a Deferred"
                    )
                    e["missing"].append({"at": at, "found": 0, "fix": fix})
        rules.append(e)
    rules.sort(key=lambda x: x["rule"])
    for x in rules:
        x["deferred"].sort()
        x["overdue"].sort()
        x["missing"].sort(key=lambda m: m["at"])
    bad = []
    for d in sorted(g.labelled("Deferred")):
        lack = [k for k in ("what", "why") if not str(g.p(d).get(k) or "").strip()]
        if lack:
            bad.append({"at": d, "fix": "say " + " and ".join(lack)})
    return {"rules": rules, "deferred_malformed": bad}


# ── §24 change sets — a dry run on a copy, no database ───────────────────────────────────────────
MODEL_MAY_ADD = {
    "Claim",
    "Assessment",
    "Evidence",
    "Proposal",
    "Option",
    "Activity",
    "Ref",
}  # §24 rule 2
MODEL_MAY_LINK = {
    "ABOUT",
    "ASSESSES",
    "BY",
    "SUPPORTED_BY",
    "CONTRADICTED_BY",
    "FROM",
    "CONSIDERED",
    "WAS_GENERATED_BY",
    "ASSOCIATED_WITH",
    "CHALLENGED_BY",
    "USED",
    "RESTS_ON",
    "WAS_DERIVED_FROM",
}


def changeset_header(block):
    first = next((line for line in block.splitlines() if line.strip()), "")
    m = re.match(
        r"\s*//\s*graph:\s*(\S+)\s*·\s*CHANGE SET\s+(\S+)"
        r"\s*·\s*against\s+([0-9a-f]{16})\s*·\s*by\s+(\S+)",
        first,
    )
    return dict(zip(("graph", "id", "against", "by"), m.groups())) if m else None


def _state(g):
    return (
        {
            i: (labels, json.dumps({k: norm(v) for k, v in p.items()}, sort_keys=True))
            for i, (labels, p) in g.nodes.items()
        },
        [
            (s, t, d, json.dumps({k: norm(v) for k, v in p.items()}, sort_keys=True))
            for s, t, d, p in g.edges
        ],
    )


def refresh_section20(store, name):
    """The §20 caches an engine re-makes when claims gain assessments, evidence or findings.
    Returns what changed."""
    g = World.from_store(store)[name]
    stored = store.graph(name)
    out = []
    key_of = {n["props"]["id"]: k for k, n in stored["nodes"].items()}
    for key, rule in (
        ("likelihood", latest_assessment(g)),
        ("confidence", confidence_from_evidence(g)),
        ("status", claim_status(g)),
    ):
        for c, v in rule.items():
            p = stored["nodes"][key_of[c]]["props"]
            if p.get(key) != v and not (key == "confidence" and p.get("rule")):
                out.append((c, key, p.get(key), v))
                p[key] = v
    return out


def check_changeset(base, block, matrix=None, lint=None, switches=frozenset()):
    """A change set dry-run against its base — [(graph, text)] applied in order. Returns (results
    [(label, ok, fix)], header, the state it would produce)."""
    import gql_profile
    from collections import Counter

    res = []

    def add(label, ok, fix=""):
        res.append((label, bool(ok), "" if ok else fix))

    h = changeset_header(block)
    add(
        "the change set names its graph, its id, the state it was made against, and its author",
        h,
        "start the block with: // graph: <graph> · CHANGE SET <id> · "
        "against <16-hex state hash> · by <author id>",
    )
    if not h:
        return res, None, None
    if lint:
        found = lint(block)
        add(
            "it passes the dialect linter (§24 H1)",
            not found,
            "; ".join(f"line {x['line']}: {x['trap']} → {x['fix']}" for x in found),
        )
    st = gql_profile.Store()
    for _, text in base:
        st.apply(text)
    if h["graph"] not in st.graphs:
        add(
            f"its graph {h['graph']} is one of the base's",
            False,
            f"the base holds {sorted(st.graphs)}",
        )
        return res, h, None
    w = World.from_store(st)
    now = canon(w[h["graph"]])[:16]
    add(
        "it was made against the graph as it stands",
        h["against"] == now,
        f"made against {h['against']}; the graph is now {now} — serve the graph again and redraft",
    )
    who = [w[g].nodes[h["by"]][0] for g in w.graphs if h["by"] in w[g].nodes]
    kind = (
        "Model"
        if any("Model" in labels for labels in who)
        else "Person"
        if any("Person" in labels for labels in who)
        else None
    )
    known = sorted(
        {
            i
            for g in w.graphs.values()
            for i, (labels, _) in g.nodes.items()
            if labels & {"Person", "Model"}
        }
    )
    add(
        f"its author {h['by']} is a known person or model",
        kind,
        f"'by' must be the author's own id, exactly — the graph knows {known}; "
        "a new author is declared by the graph's owner first",
    )
    before = _state(w[h["graph"]])
    try:
        st.apply(block)
    except gql_profile.ProfileError as e:
        add("it loads", False, f"the reader could not read it — {e}")
        return res, h, None
    after = _state(World.from_store(st)[h["graph"]])
    bc, ac = Counter(before[1]), Counter(after[1])
    gone = [i for i in before[0] if i not in after[0]] + [e[:3] for e in bc if ac[e] < bc[e]]
    changed = [i for i in before[0] if i in after[0] and before[0][i] != after[0][i]]
    if "additions-only" not in switches:
        add(
            "it only adds — nothing removed, nothing already there changed (§12)",
            not gone and not changed,
            f"removed {gone[:3]}, changed {changed[:3]} — "
            "correct a fact with a new element that supersedes it, never an edit",
        )
    new_nodes = {i: after[0][i][0] for i in after[0] if i not in before[0]}
    h["refreshes"] = refresh_section20(st, h["graph"])
    new_edges = [e for e in ac if ac[e] > bc[e]]
    w = World.from_store(st)
    g = w[h["graph"]]
    if kind == "Model" and "model-may-add" not in switches:
        bad = sorted(i for i, labels in new_nodes.items() if not labels & MODEL_MAY_ADD) + sorted(
            {e[1] for e in new_edges if e[1] not in MODEL_MAY_LINK}
        )
        add(
            "a model adds only claims, assessments, evidence, proposals and options (§24 rule 2)",
            not bad,
            f"{bad[:4]} — state it as a Claim about the subject, "
            "or as a Proposal for a person to decide; a model never asserts a fact or a decision",
        )
        by = [
            x for i in new_nodes if "Assessment" in new_nodes[i] for _, _, x, _ in g.out(i, "BY")
        ]
        add(
            "a model's assessments are its own",
            all(x == h["by"] for x in by),
            f"assessments made BY {sorted(set(by) - {h['by']})} — "
            "a model can assess only as itself",
        )
    ul, ut, ur = untyped(g)
    for label, ok, d in check(w, h["graph"], matrix):
        if label.startswith("§5") and not ok:
            d = (
                f"declare in {h['graph']}'s schema: node labels {ul}, edge types {ut}"
                + (f"; give both readings, forward and reverse, to {ur}" if ur else "")
                + " — a schema change is the graph owner's, not the change set's"
            )
        add(f"after it, {label}", ok, d or "see the rule in the graph spec model")
    return res, h, canon(g)[:16]


# ── views — the same text from Python and from JavaScript ──────────────────────
# left out of views: the schema, and §20's likelihood scale
SCHEMA_LABELS = SPEC_NODES | {"LikelihoodBand"}


def _caption(g, i):
    p = g.p(i)
    t = p.get("name") or p.get("title") or p.get("label")
    text = f"{i}<br/>{t}" if isinstance(t, str) and t else i
    return text.replace('"', "'")


def readings(g, shared=None):
    """Each declared edge type's words (§5) — {type: (reading, reverse reading)} — from the graph's
    own schema, else the shared one it names."""
    element_types = [g.p(i) for i in g.labelled("ElementType")] or (
        [shared.p(i) for i in shared.labelled("ElementType")] if shared is not None else []
    )
    return {
        t["name"]: (t.get("reading"), t.get("reverse_name"))
        for t in element_types
        if t.get("kind") == "edge"
    }


# ── Readings guessed for a type with none declared ───────────────────────────────────────────────
# Forward and reverse, from the type's own words, as the lock writes them for checking (vault task
# of 6 Oct 2026; the same rules as graph-spec-check.js guessReadings, held to one table:
# packages/graph-spec/test/reading-cases.json).
_IRREGULAR = {
    "chose": "was chosen by",
    "made": "was made by",
    "wrote": "was written by",
    "took": "was taken by",
    "gave": "was given by",
    "has": "belongs to",
    "had": "belonged to",
    "is": "is",
    "leads": "is led by",
    "holds": "is held by",
    "sent": "was sent by",
    "paid": "was paid by",
    "built": "was built by",
    "found": "was found by",
    "met": "was met by",
    "led": "was led by",
}
# a passive reading that reverses to its active verb: only where the verb is known, so never a
# wrong guess
_ACTIVE = {
    "proved": "proves",
    "cited": "cites",
    "decided": "decides",
    "owned": "owns",
    "caused": "causes",
    "supported": "supports",
    "written": "writes",
    "made": "makes",
    "chosen": "chooses",
    "approved": "approves",
    "funded": "funds",
    "used": "uses",
    "required": "requires",
    "replaced": "replaces",
    "blocked": "blocks",
    "led": "leads",
    "held": "holds",
}
_NAMED = {"part of": ("is part of", "contains"), "decided in": ("was decided in", "decides")}
_PREPOSITIONS = {
    "by", "of", "in", "on", "to", "from", "with", "for", "at", "into", "about", "against", "under",
    "over",
}  # fmt: skip


def _participle(w):
    return bool(re.search(r"(ed|en)$", w)) or w in _ACTIVE


def reverse_reading(reading):
    """The reverse of a forward reading: the active verb of a known passive, the passive of a verb,
    or a placeholder — never a wrong reading or a doubled preposition."""
    for forward, reverse in _NAMED.values():
        if forward == reading:
            return reverse
    passive = re.fullmatch(r"(is|was) (\w+) (\w+)", reading)
    if passive and passive.group(3) in _PREPOSITIONS:
        if passive.group(3) == "by" and passive.group(2) in _ACTIVE:
            return _ACTIVE[passive.group(2)]
        return f"inverse of {reading}"
    first, *rest = reading.split(" ")
    tail = (" " + " ".join(rest)) if rest else ""
    if first in _IRREGULAR and not (
        _IRREGULAR[first].endswith(" by") and rest and rest[-1] == "by"
    ):
        if _IRREGULAR[first].endswith(" by"):
            return _IRREGULAR[first][: -len(" by")] + tail + " by"
        return _IRREGULAR[first] + tail
    if (
        not first.endswith("s")
        or first.endswith("ss")
        or len(first) < 3
        or (rest and rest[-1] == "by")
    ):
        return f"inverse of {reading}"
    base = first[:-1]
    if base.endswith("e"):
        done = base + "d"
    elif re.search(r"[^aeiou]y$", base):
        done = base[:-1] + "ied"
    else:
        done = base + "ed"
    return f"is {done}{tail} by"


def guess_readings(type_name):
    """The readings guessed for a relationship type with none declared: (forward, reverse)."""
    written = type_name.replace("_", " ").lower().strip()
    words = re.sub(r"^is ", "", written)
    if words in _NAMED:
        return _NAMED[words]
    parts = words.split(" ")
    passive = len(parts) > 1 and _participle(parts[0]) and parts[-1] in _PREPOSITIONS
    forward = f"is {words}" if passive else written
    return forward, reverse_reading(forward)


def _word(type_words, t):
    # undeclared (a draft): the type's own words, COUNTS_AGAINST -> counts against
    return (type_words.get(t, (None, None))[0] or t.replace("_", " ").lower()).replace('"', "'")


def mermaid_graph(g, shared=None):
    """The graph's knowledge as a Mermaid flowchart — every node but the schema's, every
    relationship between them, labelled by its reading (§5), or its type if none is declared."""
    ids = sorted(i for i, (labels, _) in g.nodes.items() if not labels & SCHEMA_LABELS)
    var = {i: f"n{k}" for k, i in enumerate(ids)}
    type_words = readings(g, shared)
    lines = ["flowchart LR"] + [f'    {var[i]}["{_caption(g, i)}"]' for i in ids]
    lines += sorted(
        f"    {var[s]} -->|{_word(type_words, t)}| {var[d]}"
        for s, t, d, _ in g.edges
        if s in var and d in var
    )
    return "\n".join(lines)


def legend(g, shared=None):
    """What each reading in the relationships view stands for — one line per edge type drawn:
    reading = TYPE · reverse reading."""
    ids = {i for i, (labels, _) in g.nodes.items() if not labels & SCHEMA_LABELS}
    type_words = readings(g, shared)
    used = sorted({t for s, t, d, _ in g.edges if s in ids and d in ids})
    return "\n".join(
        f"{_word(type_words, t)} = {t}"
        + (f" · reverse: {type_words[t][1]}" if type_words.get(t, (None, None))[1] else "")
        for t in used
    )


def mermaid_path(g, top, level):
    """A path seen at an altitude (§22): the path, then what it shows at that level, in order."""
    items = view_at(g, top, level)
    lines = ["flowchart TB", f'    p["{_caption(g, top)}<br/>at altitude {level}"]']
    lines += [f'    s{k}["{_caption(g, x)}"]' for k, x in enumerate(items)]
    lines += ["    p --> s0"] if items else []
    lines += [f"    s{k} --> s{k + 1}" for k in range(len(items) - 1)]
    return "\n".join(lines)


def tops(g):
    """Paths nothing else steps into — where a reader starts."""
    return sorted(
        p
        for p in g.labelled("Path")
        if not any(g.has(s, "Path") for s, _, _, _ in g.inc(p, "STEP"))
    )


def views(g, shared=None):
    """Every view of one graph: its flat projection, its relationships with their legend, and each
    top path at each altitude it spans."""
    blocks, rels = project(g)
    out = {
        "projection": jcs(json.loads(json.dumps({"blocks": blocks, "relationships": rels}))),
        "relationships": mermaid_graph(g, shared),
        "legend": legend(g, shared),
    }
    for t in tops(g):
        for level in range(int(g.p(t).get("altitude") or 0), -1, -1):
            out[f"path {t} at {level}"] = mermaid_path(g, t, level)
    return out
