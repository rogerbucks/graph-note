"""The process core (editor spec §34): one kind of data under every process view.

This is the twin of the JavaScript library's src/process/core.js, and
packages/graph-spec/test/process-core-cases.json holds both to the same answers. It reads the
plain graph and writes nothing: a change it suggests comes back as graph text to join like any
other.
- The core has exactly eight kinds. Time is properties, ownership is an OWNS link, a role is an
  Actor kept apart from the Person who plays it, and layout lives in view settings. A thing of any
  other kind is flagged, never refused (core_of_eight).
- A transition is a TRANSITION link between states. It can be promoted to a Transition thing
  joined by FROM and TO links, when it carries a decision, a review, commentary or an action with
  side effects (hybrid_transitions).
- A query walks transitions like any other thing, so one path can go from a concept, through a
  state, to a part of a diagram (transitions_walkable).
- A guard is a Guard thing holding an expression, or naming a function and its version, both
  shown (guards_are_data).
- Each process has one default running rule. A run may override it on the run alone
  (running_rule_override).
"""

from __future__ import annotations

import json
from collections import deque

from graphspec.engine import guards
from graphspec.rules.plain_graph import Graph

# The eight kinds of the core, in the order the spec names them.
KINDS = ["Step", "Dependency", "Condition", "Decision", "Event", "Actor", "Artefact", "Resource"]
# The labels that hold a process together rather than being one of its kinds.
FRAME = ["Process", "State", "Transition", "Guard", "Run", "Entry", "Person"]
# The properties that belong to a view, never to the core.
VIEW_PROPS = ["x", "y", "width", "height", "layout", "lane", "colour", "color", "collapsed"]
# What a transition carries that makes it worth promoting to a thing of its own.
PROMOTE_FOR = ["decision", "review", "comment", "do"]
# The ways a process can choose among the transitions that may fire.
RUNNING_RULES = ["first-match", "all-enabled", "by-priority"]


def _link_id(a, b):
    return f"transition:{a}->{b}"


def _sort_rows(rows):
    return sorted(rows, key=lambda r: json.dumps(r, separators=(",", ":"), ensure_ascii=False))


def core_of_eight(graph: Graph) -> dict:
    """Each thing's kind, what is flagged, the view settings and the core without them."""
    kind, flags, view, core = {}, [], {}, {}
    for i, (labels, props) in graph.nodes.items():
        k = next((x for x in KINDS if x in labels), None)
        if k:
            kind[i] = k
        elif not any(lab in FRAME for lab in labels):
            flags.append(["ninth-kind", i, ":".join(sorted(labels))])
        if "Actor" in labels and "Person" in labels:
            flags.append(["person-as-role", i, ""])
        if "owner" in props:
            flags.append(["owner-as-property", i, _text(props["owner"])])
        kept, shown = {}, {}
        for p in sorted(props):
            (shown if p in VIEW_PROPS else kept)[p] = props[p]
        if shown:
            view[i] = shown
        core[i] = kept
    return {"kinds": KINDS, "kind": kind, "flags": _sort_rows(flags), "view": view, "core": core}


def _text(v):
    """A value as JavaScript's String gives it."""
    if v is True or v is False:
        return "true" if v else "false"
    if v is None:
        return "null"
    return str(v)


def transitions_of(graph: Graph) -> list:
    """Every transition: each TRANSITION link and each promoted Transition thing."""
    out = []
    for a, kind, b, props in graph.edges:
        if kind != "TRANSITION":
            continue
        props = props or {}
        out.append(
            {
                "id": _link_id(a, b),
                "from": a,
                "to": b,
                "promoted": False,
                "event": props.get("event"),
                "carries": [p for p in PROMOTE_FOR if p in props],
            }
        )
    for i in graph.labelled("Transition"):
        frm = [e[2] for e in graph.out(i, "FROM")]
        to = [e[2] for e in graph.out(i, "TO")]
        props = graph.p(i)
        out.append(
            {
                "id": i,
                "from": frm[0] if len(frm) == 1 else None,
                "to": to[0] if len(to) == 1 else None,
                "promoted": True,
                "event": props.get("event"),
                "carries": [p for p in PROMOTE_FOR if p in props],
            }
        )
    return sorted(out, key=lambda t: t["id"])


def _literal(v):
    """A value written as graph text."""
    if isinstance(v, str):
        return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"
    if isinstance(v, list):
        return "[" + ", ".join(_literal(x) for x in v) + "]"
    return _text(v)


def promote_transition(graph: Graph, a, b, tid) -> dict:
    """A TRANSITION link promoted to a Transition thing: the link to remove, the lines to add.

    The link's properties move to the thing. The lines join and can be contested like any other.
    """
    link = next((e for e in graph.edges if e[0] == a and e[1] == "TRANSITION" and e[2] == b), None)
    if link is None:
        raise ValueError(f"refused: there is no transition from {a} to {b} to promote (§34)")
    if tid in graph.nodes:
        raise ValueError(f"refused: {tid} is already a thing in the graph (§34)")
    props = link[3] or {}
    extra = "".join(f", {k}: {_literal(props[k])}" for k in sorted(props))
    return {
        "remove": [a, "TRANSITION", b],
        "lines": [
            f"({tid}:Transition {{id: {_literal(tid)}{extra}}})",
            f"({tid})-[:FROM]->({a})",
            f"({tid})-[:TO]->({b})",
        ],
    }


def process_path(graph: Graph, frm, to):
    """The shortest path between two things, walking every link either way and each transition
    as a thing of its own. None when nothing joins them."""
    nxt: dict = {}

    def join(x, y):
        nxt.setdefault(x, []).append(y)
        nxt.setdefault(y, []).append(x)

    for a, kind, b, *_ in graph.edges:
        if kind == "TRANSITION":
            join(a, _link_id(a, b))
            join(_link_id(a, b), b)
        else:
            join(a, b)
    for n in nxt.values():
        n.sort()
    before = {frm: None}
    queue = deque([frm])
    while queue:
        at = queue.popleft()
        if at == to:
            break
        for n in nxt.get(at, []):
            if n not in before:
                before[n] = at
                queue.append(n)
    if to not in before:
        return None
    path, at = [], to
    while at is not None:
        path.insert(0, at)
        at = before[at]
    return path


def guard_of(graph: Graph, transition):
    """The guard on a transition: its expression, or its function's name and version, shown."""
    found = [e[2] for e in graph.out(transition, "GUARDED_BY")]
    if not found:
        return None
    gid, p = found[0], graph.p(found[0])
    if isinstance(p.get("expression"), str):
        return {"id": gid, "expression": p["expression"], "shown": p["expression"]}
    if isinstance(p.get("function"), str) and "version" in p:
        version = _text(p["version"])
        return {
            "id": gid,
            "function": p["function"],
            "version": version,
            "shown": f"{p['function']} v{version}",
        }
    return {"id": gid, "shown": "", "flag": "guard-holds-nothing"}


def guard_allows(guard: dict, ctx: dict, functions: dict | None = None) -> bool:
    """Whether a guard holds. A named function runs the version the guard names, from `functions`
    as {name: {version: fn}}. A version not given is refused, never guessed."""
    if "expression" in guard:
        return guards.holds(guard["expression"], ctx)
    versions = (functions or {}).get(guard["function"])
    if not versions or guard["version"] not in versions:
        raise ValueError(
            f"refused: no function {guard['function']} at version {guard['version']}"
            " is given (§34)"
        )
    return bool(versions[guard["version"]](ctx))


def running_rule_of(graph: Graph, run) -> dict:
    """The running rule a run follows: its own override, or its process's one default."""
    r = graph.p(run)
    process = graph.p(r.get("process"))
    fallback = (
        process.get("running_rule") if process.get("running_rule") in RUNNING_RULES else None
    )
    if "running_rule" in r:
        return {"rule": r["running_rule"], "from": "run", "process_default": fallback}
    return {
        "rule": fallback,
        "from": "none" if fallback is None else "process",
        "process_default": fallback,
    }


def override_running_rule(graph: Graph, run, rule) -> Graph:
    """The graph with a run's running rule overridden on the run alone; the process is left."""
    if rule not in RUNNING_RULES:
        raise ValueError(f"refused: a running rule is one of {', '.join(RUNNING_RULES)}")
    if not graph.has(run, "Run"):
        raise ValueError(f"refused: {run} is not a run (§34)")
    nodes = dict(graph.nodes)
    labels, props = nodes[run]
    nodes[run] = (labels, {**props, "running_rule": rule})
    return Graph(nodes, graph.edges)
