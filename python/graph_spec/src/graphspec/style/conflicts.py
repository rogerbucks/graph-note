"""The nudges of a style graph checked against each other (editor spec §6, nudge_problems): two
directions, beside and before on one pair, a thing in two groups, a loop of befores. Each is a
problem with a fix; the first written is kept and the later left out, so what is kept never
conflicts. The core's style-conflicts.ts, function for function, as far as nudges go."""

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
