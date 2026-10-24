"""Altitude and audience profiles (editor spec §32).

This is the twin of the JavaScript library's src/altitude/altitude.js, and
packages/graph-spec/test/altitude-cases.json holds both to the same answers.

Two axes, kept apart (altitude_composition_apart):
- Composition: how things nest. A Path holds its steps (graph spec §22) and a Cluster its members.
  Altitude is a query parameter over their levels (altitude_query_parameter). At a level, each
  part over it opens, and each part at or under it shows as one thing: a path as itself, a cluster
  as its centroid. Links between shown things are bundled.
- Audience: who a view is for. A Profile names one by three criteria: vocabulary depth,
  prerequisite knowledge and the ratio of metaphor to mechanism (audience_profiles_named). A
  board, a risk team or a university class all use the same three (one_profile_mechanism).
A thing's place on the audience axis is a link, never a property of the thing alone
(altitude_relative_to_lens). So switching lens or profile re-projects the view and edits nothing.
"""

from __future__ import annotations

import json

from graphspec.engine.clusters.centroids import centroid_id
from graphspec.rules.plain_graph import Graph

# The criteria every profile is defined by, business and teaching alike.
CRITERIA = ["vocabulary_depth", "prerequisite_knowledge", "metaphor_to_mechanism"]
# The properties that would put a thing's audience altitude on the thing alone. They are flagged.
ON_THING = ["band", "audience", "audience_altitude"]
# The links that make the composition, never drawn as links between shown things.
STRUCTURE = ["STEP", "MEMBER_OF"]


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _parts_of(graph):
    """The parts of the composition: each Path and Cluster, its members and its level."""
    members: dict = {}
    for i in graph.labelled("Path"):
        members[i] = [e[2] for e in graph.out(i, "STEP")]
    for i in graph.labelled("Cluster"):
        if i not in members:
            members[i] = [e[0] for e in graph.inc(i, "MEMBER_OF")]
    level: dict = {}

    def level_of(i, open_=None):
        open_ = open_ if open_ is not None else set()
        if i in level:
            return level[i]
        a = graph.p(i).get("altitude")
        if _is_number(a):
            level[i] = a
            return a
        if i in open_:
            return 1
        open_.add(i)
        deepest = 0
        for m in members[i]:
            if m in members:
                deepest = max(deepest, level_of(m, open_))
        open_.discard(i)
        level[i] = deepest + 1
        return level[i]

    for i in members:
        level_of(i)
    parent: dict = {}
    for i in graph.nodes:
        if i in members:
            for m in members[i]:
                if m not in parent and m in graph.nodes and m != i:
                    parent[m] = i
    return members, level, parent


def at_altitude(graph: Graph, level: float) -> dict:
    """What a query shows at altitude `level`: each thing as the highest part holding it at or
    under the level, the parts over it opened, and links between what is shown, bundled."""
    members, levels, parent = _parts_of(graph)

    def shown_as(i):
        return i if graph.has(i, "Path") or i not in members else centroid_id(i)

    rep: dict = {}
    for i in graph.nodes:
        if i in members and levels[i] > level:
            continue
        best, seen, at = i, {i}, parent.get(i)
        while at is not None and at not in seen:
            seen.add(at)
            if levels[at] <= level:
                best = at
            at = parent.get(at)
        rep[i] = shown_as(best)
    things = list(dict.fromkeys(rep.values()))
    bundled: dict = {}
    for a, kind, b, *_ in graph.edges:
        if kind in STRUCTURE or a not in rep or b not in rep:
            continue
        ra, rb = rep[a], rep[b]
        if ra == rb:
            continue
        bundled[(ra, kind, rb)] = bundled.get((ra, kind, rb), 0) + 1
    links = sorted(
        ([*k, n] for k, n in bundled.items()),
        key=lambda x: json.dumps(x, separators=(",", ":"), ensure_ascii=False),
    )
    shown = {i: r for i, r in sorted(rep.items()) if i != r}
    return {"level": level, "things": things, "links": links, "shown_as": shown}


def profiles_of(graph: Graph) -> list:
    """The audience profiles: each Profile's name, domain, three criteria and any it lacks."""
    out = []
    for i in sorted(graph.labelled("Profile")):
        p = graph.p(i)
        out.append(
            {
                "id": i,
                "name": p["name"] if isinstance(p.get("name"), str) else i,
                "domain": p["domain"] if isinstance(p.get("domain"), str) else None,
                "criteria": {c: p[c] for c in CRITERIA if c in p},
                "missing": [c for c in CRITERIA if c not in p],
            }
        )
    return out


def _profile_named(profiles, name):
    return next((p for p in profiles if p["id"] == name or p["name"] == name), None)


def audience_projection(graph: Graph, names: list) -> dict:
    """Each thing as the profiles passed to a lens read it. For each domain, the first profile
    passed that has a projection of the thing gives it, so profiles of one domain combine."""
    profiles = profiles_of(graph)
    asked = [p for p in (_profile_named(profiles, n) for n in names) if p]
    out = {}
    for i in graph.nodes:
        links = graph.out(i, "PROJECTED_FOR")
        if not links:
            continue
        seen: dict = {}
        for p in asked:
            domain = p["domain"] if p["domain"] is not None else p["id"]
            if domain in seen:
                continue
            link = next((e for e in links if e[2] == p["id"]), None)
            if link:
                seen[domain] = {"profile": p["id"], "text": link[3].get("text")}
        if seen:
            out[i] = seen
    return out


def altitudes_in(graph: Graph, lens: str) -> dict:
    """The level a lens or profile shows each thing at: its AT_ALTITUDE link, else the lens's own
    altitude. Things that put their audience altitude on themselves alone are flagged."""
    own = graph.p(lens).get("altitude")
    fallback = own if _is_number(own) else None
    levels, flags = {}, []
    for i, (labels, props) in graph.nodes.items():
        if i == lens or "Lens" in labels or "Profile" in labels:
            continue
        for k in ON_THING:
            if k in props:
                flags.append(["altitude-on-thing", i, k])
        if "Path" in labels or "Cluster" in labels:
            continue
        link = next((e for e in graph.out(i, "AT_ALTITUDE") if e[2] == lens), None)
        at = link[3]["level"] if link and _is_number(link[3].get("level")) else fallback
        if at is not None:
            levels[i] = at
    return {"lens": lens, "levels": levels, "flags": flags}


def by_axes(graph: Graph, query: dict | None = None) -> list:
    """The things on one axis or both: `composition` keeps those at that composition level, and
    `audience` those a profile of that name projects or places. Given both, both must match."""
    query = query or {}
    members, level, _ = _parts_of(graph)
    profiles = profiles_of(graph)
    audience = _profile_named(profiles, query["audience"]) if "audience" in query else None
    out = []
    for i, (labels, props) in graph.nodes.items():
        if "Profile" in labels or "Lens" in labels:
            continue
        if "composition" in query:
            c = props["composition"] if "composition" in props else level.get(i, 0)
            if c != query["composition"]:
                continue
        if "audience" in query:
            if not audience:
                continue
            if not any(
                e[1] in ("PROJECTED_FOR", "AT_ALTITUDE") and e[2] == audience["id"]
                for e in graph.out(i)
            ):
                continue
        out.append(i)
    return out
