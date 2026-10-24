"""The altitude and topic index (editor spec §32, altitude_topic_index).

This is the twin of the JavaScript library's src/altitude/altitude-index.js, and
packages/graph-spec/test/altitude-index-cases.json holds both to the same answers.

Each thing is indexed by its topic tags and its altitudes: the level each lens or profile shows it
at, and the profiles that project it. A search finds a tag exactly, or by likeness of spelling,
and ranks what it finds by the certainty sort key made from the thing's words. A contested thing
is marked. The index is derived, never written: built again from the same text it is the same.
"""

from __future__ import annotations

import hashlib
import math

from graphspec.engine.mesh.mesh_join import certainty_of
from graphspec.rules.canonical_json import jcs
from graphspec.rules.named_hashes import named
from graphspec.rules.plain_graph import Graph

# The kinds that frame a view rather than being things to find.
FRAME = ["Lens", "Profile"]
# How alike two spellings must be, from 0 to 1, for a search by likeness to find one.
ALIKE = 0.3


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _tags_of(props):
    """A thing's topic tags: its `topic`, and each comma-separated part of its `topics`, sorted."""
    tags = []
    if isinstance(props.get("topic"), str):
        tags.append(props["topic"])
    if isinstance(props.get("topics"), str):
        tags.extend(t.strip() for t in props["topics"].split(",") if t.strip())
    return sorted(set(tags))


def altitude_index(graph: Graph) -> dict:
    """The index of a graph: one entry per thing, in the graph's order, and the hash of them."""
    entries = []
    for i, (labels, props) in graph.nodes.items():
        if any(lab in labels for lab in FRAME):
            continue
        altitudes = sorted(
            (
                [e[2], e[3]["level"]]
                for e in graph.out(i, "AT_ALTITUDE")
                if _is_number(e[3].get("level"))
            ),
            key=lambda a: a[0],
        )
        profiles = sorted({e[2] for e in graph.out(i, "PROJECTED_FOR")})
        tags = _tags_of(props)
        if not tags and not altitudes and not profiles:
            continue
        c = certainty_of(props)
        entries.append(
            {
                "id": i,
                "tags": tags,
                "altitudes": altitudes,
                "profiles": profiles,
                "contested": props.get("status") == "contested",
                "sort_key": None if c is None else c["sort_key"],
            }
        )
    return {"entries": entries, "hash": named(hashlib.sha256(jcs(entries).encode()).hexdigest())}


def _triples(text):
    """The letter triples of a text, lower case and padded."""
    t = f"  {str(text).lower()} "
    return {t[i : i + 3] for i in range(len(t) - 2)}


def _alike(a, b):
    """How alike two spellings are: the share of letter triples in common, from 0 to 1."""
    x, y = _triples(a), _triples(b)
    both = len(x & y)
    return both / (len(x) + len(y) - both)


def search_index(index: dict, query: dict | None = None) -> list:
    """The entries a search finds, ranked by certainty sort key, then by how alike, then by id.

    `topic` finds a tag exactly and `like` tags alike in spelling. `lens` with `level` keeps those
    it shows at that level, and `profile` those it projects. Each answer says if it is contested.
    """
    query = query or {}
    out = []
    for e in index["entries"]:
        score = 1
        if "topic" in query and query["topic"] not in e["tags"]:
            continue
        if "like" in query:
            score = max((_alike(query["like"], t) for t in e["tags"]), default=0)
            if score < ALIKE:
                continue
        if "lens" in query and not any(
            a[0] == query["lens"] and a[1] == query.get("level") for a in e["altitudes"]
        ):
            continue
        if "profile" in query and query["profile"] not in e["profiles"]:
            continue
        out.append(
            {"id": e["id"], "score": score, "sort_key": e["sort_key"], "contested": e["contested"]}
        )

    def key(x):
        k = -math.inf if x["sort_key"] is None else x["sort_key"]
        return (-k, -x["score"], x["id"])

    return sorted(out, key=key)
