"""Contexts: where links may join (editor spec §61).

A context is a named boundary, written as graph data: a note, a folder, a vault or a client.
Every graph belongs to exactly one, its vault when none claims it. Same-name guesses across
contexts are shown only when a context or a view turns them on. Things in two contexts are never
compared, unless both graphs name the same shared schema or a SAME_AS link joins them. A SAME_AS
across contexts is written by a person only, and is listed in both. Nothing from a context the
viewer cannot read reaches a guess or a search, and an AI asked in one context reads only it.
This is the twin of the JavaScript library's src/mesh/contexts.js, and both answer the same.
"""

from __future__ import annotations

import re
from typing import Any, Callable

from graphspec.engine.mesh.same_as import same_as
from graphspec.rules.plain_graph import World

# the kinds a context may be, most particular first: a graph two claim goes to the more particular
KINDS = ["client", "note", "folder", "vault"]
# a graph's or a thing's name: one word, so a link written from it is only ever that link
WORD = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _in_folder(path: str, folder: str) -> bool:
    return path.startswith(folder if folder.endswith("/") else folder + "/")


def _graph_of(at: str) -> str:
    return at[: at.index("/")]


def contexts_of(
    world: World,
    graph: str = "contexts",
    notes: dict[str, str] | None = None,
    vault: str = "vault",
) -> dict[str, Any]:
    """The contexts of a world, from the graph `graph` names, and the one each graph belongs to.
    `notes` gives each graph's note path, for note and folder contexts. A graph none claims belongs
    to `vault`."""
    notes = notes or {}
    g = world.graphs.get(graph)
    contexts: dict[str, Any] = {vault: {"kind": "vault", "guessesAcross": False}}
    claims: dict[str, tuple[str, tuple[int, int]]] = {}

    def claim(graph_name: str, name: str, kind: str, depth: int) -> None:
        rank = (KINDS.index(kind), -depth)
        had = claims.get(graph_name)
        if had is None or rank < had[1]:
            claims[graph_name] = (name, rank)

    if g is not None:
        for cid in g.labelled("Context"):
            p = g.p(cid)
            kind = p.get("kind") if p.get("kind") in KINDS else "client"
            contexts[cid] = {"kind": kind, "guessesAcross": p.get("guesses_across") is True}
            if kind == "vault":
                continue
            for _, _, end, _ in g.out(cid, "CONTAINS"):
                if g.has(end, "Ref"):
                    claim(str(g.p(end).get("graph")), cid, kind, 0)
            path = p.get("path")
            if isinstance(path, str):
                for graph_name, note in notes.items():
                    if (note == path) if kind == "note" else _in_folder(note, path):
                        claim(graph_name, cid, kind, len(path))
    by_graph = {
        name: claims[name][0] if name in claims else vault
        for name in sorted(world.graphs)
        if name != graph
    }
    return {"contexts": contexts, "byGraph": by_graph, "vault": vault, "graph": graph}


def _context_at(ctx: dict[str, Any], at: str) -> str:
    return ctx["byGraph"].get(_graph_of(at), ctx["vault"])


def context_guesses(
    world: World,
    ctx: dict[str, Any],
    view: dict[str, Any] | None = None,
    can_read: Callable[[str], bool] = lambda _: True,
) -> list[dict[str, Any]]:
    """The same-name guesses to show: inside one context as §27 lists them; across contexts when
    the view says so, or else when one of their contexts turns guesses on. A thing in a context the
    viewer cannot read is left out, and a guess left with one thing is no guess."""
    view = view or {}
    out = []
    for guess in same_as(world)["guesses"]:
        things = [
            at
            for at in guess["things"]
            if _graph_of(at) != ctx["graph"] and can_read(_context_at(ctx, at))
        ]
        if len(things) < 2:
            continue
        kinds = list(dict.fromkeys(_context_at(ctx, at) for at in things))
        across = len(kinds) > 1
        if not across:
            shown = True
        elif isinstance(view.get("acrossContexts"), bool):
            shown = view["acrossContexts"]
        else:
            shown = any(ctx["contexts"].get(k, {}).get("guessesAcross") for k in kinds)
        if not shown:
            for k in kinds:
                inside = [at for at in things if _context_at(ctx, at) == k]
                if len(inside) > 1:
                    out.append({"name": guess["name"], "things": inside, "across": False})
            continue
        out.append({"name": guess["name"], "things": things, "across": across})
    return out


def comparable(world: World, ctx: dict[str, Any], a: str, b: str) -> bool:
    """Whether two things may be compared or joined: in one context; or both graphs name the same
    shared schema; or a SAME_AS link makes them one."""
    if _context_at(ctx, a) == _context_at(ctx, b):
        return True
    sa = world.schema_for(_graph_of(a))[0]
    sb = world.schema_for(_graph_of(b))[0]
    if sa and sa == sb:
        return True
    return any(a in one and b in one for one in same_as(world)["ones"])


def propose_same_as(
    ctx: dict[str, Any], start: dict[str, str], end: dict[str, str], by: dict[str, str]
) -> dict[str, Any]:
    """What becomes of a proposed SAME_AS link from `start` to `end`, by `by`. Across contexts,
    only a person's is written; any other waits for a person."""
    names = [start["graph"], start["thing"], end["graph"], end["thing"]]
    if not all(WORD.match(str(n)) for n in names):
        return {"status": "refused", "why": "not-a-name"}
    here = ctx["byGraph"].get(start["graph"], ctx["vault"])
    there = ctx["byGraph"].get(end["graph"], ctx["vault"])
    across = here != there
    if across and by.get("kind") != "person":
        return {"status": "waiting", "for": "person", "from": start, "to": end, "by": by}
    ref = f"same_as_{end['graph']}_{end['thing']}"
    text = (
        f"({ref}:Ref {{graph: '{end['graph']}', ref: '{end['thing']}'}}),\n"
        f"({start['thing']})-[:SAME_AS]->({ref})"
    )
    return {"status": "write", "graph": start["graph"], "text": text, "across": across}


def same_as_across(world: World, ctx: dict[str, Any], context: str) -> list[dict[str, Any]]:
    """The SAME_AS links crossing into or out of `context`, listed on both sides."""
    out = []
    for graph in sorted(world.graphs):
        g = world.graphs[graph]
        for start, typ, end, _ in g.edges:
            if typ != "SAME_AS" or not g.has(end, "Ref"):
                continue
            ref = g.p(end)
            a = ctx["byGraph"].get(graph, ctx["vault"])
            b = ctx["byGraph"].get(ref.get("graph"), ctx["vault"])
            if a != b and context in (a, b):
                out.append(
                    {
                        "from": f"{graph}/{start}",
                        "to": f"{ref.get('graph')}/{ref.get('ref')}",
                        "contexts": [a, b],
                    }
                )
    return out


def world_in(world: World, ctx: dict[str, Any], context: str) -> dict[str, Any]:
    """The graphs one context sees, by name: its own only."""
    return {g: world.graphs[g] for g, c in ctx["byGraph"].items() if c == context}


def search_contexts(
    world: World,
    ctx: dict[str, Any],
    text: str,
    can_read: Callable[[str], bool] = lambda _: True,
) -> list[str]:
    """The things whose name or text holds `text`, as `graph/key`, from readable contexts only."""
    want = str(text).lower()
    out = []
    for graph, context in ctx["byGraph"].items():
        if not can_read(context):
            continue
        for key, (_, p) in world.graphs[graph].nodes.items():
            if want in key.lower() or any(want in _text(v).lower() for v in p.values()):
                out.append(f"{graph}/{key}")
    return sorted(out)


def _text(v: Any) -> str:
    """A value as JavaScript's String() writes it, so a search finds the same in both."""
    if v is True:
        return "true"
    if v is False:
        return "false"
    return str(v)
