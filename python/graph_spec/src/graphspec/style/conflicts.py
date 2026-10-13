"""The things of a style graph checked against each other (editor spec §6, nudge_problems; §14;
§15): nudges that conflict — two directions, beside and before on one pair, a thing in two groups,
a loop of befores — a property switched both on and off for one kind, thing or type in one view,
arrowheads both hidden and shown for the same links in one view, and two diagram types for the
whole graph or one view. Each is a problem with a fix;
the first written is kept and the later left out, so what is kept never conflicts. The core's
style-conflicts.ts, function for function, as far as what graph_svg draws goes."""

from __future__ import annotations

from graphspec.style.words import style_problem

REMOVE = "remove one of them"


def _chain(after, from_, to):
    """The path of befores from `from_` to `to`, if there is one: the things in order, both ends
    included."""
    came, queue = {from_: from_}, [from_]
    i = 0
    while i < len(queue):
        at = queue[i]
        if at == to:
            path = [at]
            while path[0] != from_:
                path.insert(0, came[path[0]])
            return path
        for nxt in after.get(at, []):
            if nxt not in came:
                came[nxt] = at
                queue.append(nxt)
        i += 1
    return None


def settle_nudges(nudges: list[dict], graph: str) -> tuple[list[dict], str | None, list[dict]]:
    """The nudges that conflict with none written before them, the direction a direction nudge
    sets (or None), and a problem for each nudge that conflicts."""
    kept, out, pairs, groups, after = [], [], {}, {}, {}
    direction = None

    def conflict(n, message):
        out.append(style_problem(graph, n["at"], message, REMOVE))

    for n in nudges:
        if n["word"] == "direction":
            if direction is not None and direction.get("direction") != n.get("direction"):
                conflict(
                    n,
                    f"this direction nudge ({n.get('direction')}) conflicts with the one on line "
                    f"{direction['at']['line']} ({direction.get('direction')})",
                )
                continue
            direction = direction if direction is not None else n
        elif n["word"] == "group":
            first = groups.get(n["thing"])
            if first is not None and first.get("group") != n.get("group"):
                conflict(
                    n,
                    f"{n['thing']} is in two groups, {first.get('group')} "
                    f"(line {first['at']['line']}) and {n.get('group')}",
                )
                continue
            groups[n["thing"]] = first if first is not None else n
        else:
            a, b = n["thing"], n["other"]
            pair = "\0".join(sorted([a, b], key=lambda s: s.encode("utf-16-be")))
            first = pairs.get(pair)
            if first is not None and first["word"] != n["word"]:
                conflict(
                    n,
                    f"{first['thing']} and {first['other']} cannot be both beside and before "
                    f"each other: this conflicts with line {first['at']['line']}",
                )
                continue
            if n["word"] == "before":
                loop = _chain(after, b, a)
                if loop:
                    conflict(n, f"this before nudge closes a loop: {' before '.join([*loop, b])}")
                    continue
                after[a] = [*after.get(a, []), b]
            if first is None:
                pairs[pair] = n
        kept.append(n)
    chosen = direction.get("direction") if direction is not None else None
    return kept, chosen or None, out


def _settle_choices(things, place_of, choice_of, said, graph):
    """The things of one kind that conflict with none written before them: two that choose for
    the same place differently are a problem on the later, which is left out; the same choice
    written twice is kept. Returns (kept, problems)."""
    first, kept, out = {}, [], []
    for t in things:
        was = first.setdefault(place_of(t), t)
        if was is t or choice_of(was) == choice_of(t):
            kept.append(t)
        else:
            out.append(style_problem(graph, t["at"], said(was, t), REMOVE))
    return kept, out


def _in_view(view):
    return "" if view is None else f" in view {view}"


def settle_shows(shows: list[dict], graph: str) -> tuple[list[dict], list[dict]]:
    """The properties shown, each switched one way only for each kind, thing or type in each
    view; and a problem for each one switched the other way."""

    def place(s):
        keys = ("view", "kind", "thing", "type")
        return "\0".join([*(s.get(k) or "" for k in keys), s["property"]])

    def said(was, s):
        what = s.get("kind") or s.get("thing") or s.get("type")
        return (
            f"{s['property']} of {what} is switched both {was['inline']} "
            f"(line {was['at']['line']}) and {s['inline']}{_in_view(s.get('view'))}"
        )

    return _settle_choices(shows, place, lambda s: s["inline"], said, graph)


def settle_arrows(arrows: list[dict], graph: str) -> tuple[list[dict], list[dict]]:
    """Where arrowheads are hidden or shown, each chosen one way only for every link or a type,
    in each view; and a problem for each one chosen the other way."""

    def place(a):
        return "\0".join([a.get("view") or "", a.get("type") or ""])

    def said(was, a):
        where = "in the whole graph" if a.get("view") is None else f"in view {a['view']}"
        return (
            f"the arrowheads of {a.get('type') or 'every link'} {where} are set to both "
            f"{was['arrowheads']} (line {was['at']['line']}) and {a['arrowheads']}"
        )

    return _settle_choices(arrows, place, lambda a: a["arrowheads"], said, graph)


def _type_said(d):
    """A diagram type as a sentence says it: its type, and for a tree the relationship it
    follows."""
    along = "" if d.get("relationship") is None else f" along {d['relationship']}"
    return f"{d['type']}{along}"


def settle_diagrams(diagrams: list[dict], graph: str) -> tuple[list[dict], list[dict]]:
    """The diagram types chosen, one for the whole graph and one for each view (§15); and a
    problem for each one chosen otherwise for the same place."""

    def said(was, d):
        where = "the whole graph" if d.get("view") is None else f"view {d['view']}"
        return (
            f"the diagram type of {where} is set to both {_type_said(was)} "
            f"(line {was['at']['line']}) and {_type_said(d)}"
        )

    return _settle_choices(diagrams, lambda d: d.get("view") or "", _type_said, said, graph)
