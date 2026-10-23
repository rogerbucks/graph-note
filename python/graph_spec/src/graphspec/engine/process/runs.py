"""A process run and its log (editor spec §34).

This is the twin of the JavaScript library's src/process/runs.js, and
packages/graph-spec/test/process-core-cases.json holds both to the same answers.
- A run's state is its log: Entry things, each saying a state was entered or left, in order. The
  CURRENT links are worked out from the log and made again after each new entry, so a lost one
  comes back the same (run_log_is_truth).
- A state may hold its own machine through CONTAINS links, with no depth limit. Entering it enters
  the inner machine's first state too. Each inner event is logged under its parent state
  (machines_inside_states). A loop of CONTAINS links is refused, as the recursion rules ask.
"""

from __future__ import annotations

from graphspec.rules.plain_graph import Graph


def run_log(graph: Graph, run) -> list:
    """A run's log in order: each entry's number, what it did, its state, its parent and when."""
    out = []
    for i in graph.labelled("Entry"):
        p = graph.p(i)
        if p.get("run") == run:
            out.append(
                {
                    "seq": p["seq"],
                    "did": p["did"],
                    "state": p["state"],
                    "under": p.get("under"),
                    "at": p.get("at"),
                }
            )
    return sorted(out, key=lambda e: e["seq"])


def current_of(graph: Graph, run) -> list:
    """The states a run is in now, from its log alone: entered, not left since, outermost first."""
    now: list = []
    for e in run_log(graph, run):
        if e["did"] == "entered" and e["state"] not in now:
            now.append(e["state"])
        if e["did"] == "left" and e["state"] in now:
            now.remove(e["state"])
    return now


def _container_of(graph, state):
    """The state that holds a state's machine, or None."""
    c = [e[0] for e in graph.inc(state, "CONTAINS")]
    return c[0] if c else None


def holders_of(graph: Graph, state) -> list:
    """The states holding a state, outermost first. A loop of CONTAINS links is refused."""
    out, seen = [], {state}
    at = _container_of(graph, state)
    while at is not None:
        if at in seen:
            raise ValueError(f"refused: states contain each other in a loop through {at} (§34)")
        seen.add(at)
        out.insert(0, at)
        at = _container_of(graph, at)
    return out


def _inner_start(graph, state):
    """The first state of the machine a state holds, or None."""
    starts = [e[2] for e in graph.out(state, "CONTAINS") if graph.p(e[2]).get("initial") is True]
    return starts[0] if starts else None


def _last_seq(graph, run):
    return max((e["seq"] for e in run_log(graph, run)), default=0)


def enter_state(graph: Graph, run, state, at=None) -> list:
    """The entries that enter a state, then each inner machine's first state, at any depth."""
    seq, out, seen = _last_seq(graph, run), [], set()
    s = state
    while s is not None:
        if s in seen:
            raise ValueError(f"refused: states contain each other in a loop through {s} (§34)")
        seen.add(s)
        holders_of(graph, s)
        seq += 1
        out.append(
            {"seq": seq, "did": "entered", "state": s, "under": _container_of(graph, s), "at": at}
        )
        s = _inner_start(graph, s)
    return out


def leave_state(graph: Graph, run, state, at=None) -> list:
    """The entries that leave a state, every current state inside it first, innermost first."""
    seq = _last_seq(graph, run)
    inside = [s for s in current_of(graph, run) if s == state or state in holders_of(graph, s)]
    out = []
    for s in reversed(inside):
        seq += 1
        out.append(
            {"seq": seq, "did": "left", "state": s, "under": _container_of(graph, s), "at": at}
        )
    return out


def refresh_current(graph: Graph, run) -> Graph:
    """The graph with a run's CURRENT links made again from its log, after any others it has."""
    edges = [e for e in graph.edges if not (e[0] == run and e[1] == "CURRENT")]
    for s in current_of(graph, run):
        edges.append((run, "CURRENT", s, {}))
    return Graph(graph.nodes, edges)


def with_entries(graph: Graph, run, entries) -> Graph:
    """The graph with new entries added to a run's log as Entry things, and CURRENT made again."""
    nodes = dict(graph.nodes)
    for e in entries:
        eid = f"{run}:{e['seq']}"
        props = {"id": eid, "run": run, "seq": e["seq"], "did": e["did"], "state": e["state"]}
        if e["under"] is not None:
            props["under"] = e["under"]
        if e["at"] is not None:
            props["at"] = e["at"]
        nodes[eid] = (frozenset(["Entry"]), props)
    return refresh_current(Graph(nodes, graph.edges), run)


def move_run(graph: Graph, run, frm, to, at=None) -> list:
    """A run moved between states: the entries leaving the first, then those entering the next."""
    left = leave_state(graph, run, frm, at)
    return left + enter_state(with_entries(graph, run, left), run, to, at)
