"""The graph mesh's join (editor spec §28 and editor spec §30): graphs from many notes joined, with what the
join found.

It is built on the §21 join (engine/joining), which already keeps both sides of a clash as
contested claims. This adds:

- each conflict with both sides and who states each (conflicts_flagged_kept);
- the gaps: what one graph states that another, holding the same thing, does not
  (mesh_join_reports_gaps);
- each claim's certainty in words, its range and a sort key made from them, never read from the
  text (certainty_in_words, certainty_query_dimension);
- each thing's standing, where a dispute lowers only the thing disputed (doubt_stays_local),
  unless a view asks to spread it across a cluster;
- a marker on each link between a contested thing and a well-supported one
  (contested_link_marker);
- hand-made clusters, asserted until a join disagrees about a member (hand_clusters_contestable);
- states of joined process machines with the same name, matched only as a guess until the user
  says the two are in the same domain (state_names_start_doubtful).

This is the twin of the JavaScript library's src/mesh/mesh-join.js. The shared cases in
packages/graph-spec/test/mesh-join-cases.json hold both to the same answers.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable
from typing import Any

from graphspec.engine.certainty.scale import RANGE, band_rank
from graphspec.engine.joining.finish import join
from graphspec.engine.joining.trust import held_by_trust
from graphspec.rules.canonical_json import jcs, norm

# The confidence words, weakest first; a claim's sort key counts them after its likelihood.
CONFIDENCE = ("low", "moderate", "high")
# The properties that hold a certainty. Each must be a word: a number here is flagged.
CERTAINTY_PROPS = ("likelihood", "likelihood_to", "confidence", "certainty", "probability")
# The highest chance, in percent, a claim may have and still count as unlikely.
UNLIKELY_AT_MOST = 45


def _sorted(xs: Iterable[Any]) -> list[Any]:
    return sorted(xs, key=jcs)


def _link(key: tuple[Any, ...]) -> str:
    return f"{key[0]}-[:{key[1]}]->{key[2]}"


def _about(c: dict[str, Any]) -> str:
    """What a join claim is about: a property, the labels, or a relationship's property."""
    if "claimed_relationship" in c:
        prop = c.get("claimed_property")
        return c["claimed_relationship"] + ("" if prop is None else " " + prop)
    if "claimed_property" in c:
        return c["claimed_property"]
    return "labels"


def _side(c: dict[str, Any]) -> Any:
    """What a join claim says: its value, its label, or that the relationship holds."""
    if "claimed_property" in c:
        return norm(c.get("claimed_value"))
    if "claimed_label" in c:
        return c["claimed_label"]
    return True


def _number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def certainty_of(claim: dict[str, Any]) -> dict[str, Any] | None:
    """A claim's certainty, from its words alone: its range in percent, and a sort key. The key is
    the middle of the range, then the confidence, so a likelier claim sorts first and a
    better-counted one first among equals. It is made here, never stored or typed."""
    word, to = claim.get("likelihood"), claim.get("likelihood_to") or claim.get("likelihood")
    if (
        not isinstance(word, str)
        or not isinstance(to, str)
        or word not in RANGE
        or to not in RANGE
    ):
        return None
    lo, hi = RANGE[word][0], RANGE[to][1]
    conf = claim.get("confidence")
    rank = CONFIDENCE.index(conf) if conf in CONFIDENCE else 0
    return {"range": [lo, hi], "sort_key": (lo + hi) * 2 + rank}


def _shaky(claim: dict[str, Any], c: dict[str, Any] | None) -> bool:
    """Whether a claim is shaky: contested, or no more than unlikely."""
    return claim.get("status") == "contested" or (
        c is not None and c["range"][1] <= UNLIKELY_AT_MOST
    )


def by_certainty(
    claims: Iterable[dict[str, Any]], shaky: bool = False, at_least: str | None = None
) -> list[dict[str, Any]]:
    """Claims filtered and ranked by certainty, likeliest first. `shaky` keeps only the shaky
    ones, and `at_least` those whose likelihood word is at least as likely as the one named."""
    out = []
    for claim in claims:
        c = certainty_of(claim)
        if c is None:
            continue
        if shaky and not _shaky(claim, c):
            continue
        if at_least is not None and band_rank(claim["likelihood"]) < band_rank(at_least):
            continue
        out.append(
            {
                "id": claim["id"],
                "status": claim.get("status") or "asserted",
                "likelihood": claim["likelihood"],
                "likelihood_to": claim.get("likelihood_to") or claim["likelihood"],
                "confidence": claim.get("confidence"),
                "range": c["range"],
                "sort_key": c["sort_key"],
            }
        )
    return sorted(out, key=lambda x: (-x["sort_key"], x["id"]))


def _conflicts(joined: dict[str, Any]) -> list[dict[str, Any]]:
    """Each conflict, with each side's value and the documents that state it."""
    groups: dict[tuple[str, str], list[Any]] = {}
    for c in joined["claims"].values():
        if c["status"] != "contested":
            continue
        groups.setdefault((c["_about"][0][1], _about(c)), []).append(
            [_side(c), sorted(c["_docs"])]
        )
    return _sorted(
        {"subject": s, "about": a, "sides": _sorted(sides)} for (s, a), sides in groups.items()
    )


def _gaps(joined: dict[str, Any], counted: list[dict[str, Any]]) -> list[list[Any]]:
    """A thing only some documents hold, a property of a shared thing only some state, and a
    relationship only some state although they hold both its ends."""
    every = sorted(d["id"] for d in counted)
    out: list[list[Any]] = []
    for nid in joined["nodes"]:
        holders = [d for d in counted if nid in d["nodes"]]
        ids = sorted(d["id"] for d in holders)
        if len(ids) < len(every):
            out.append(["thing", nid, "", ids, [i for i in every if i not in ids]])
        if len(holders) < 2:
            continue
        for k in {k for d in holders for k in d["nodes"][nid]["props"]}:
            if k == "id":
                continue
            say = sorted(d["id"] for d in holders if k in d["nodes"][nid]["props"])
            if len(say) < len(holders):
                out.append(["property", nid, k, say, [i for i in ids if i not in say]])
    for key in joined["edges"]:
        say = sorted(d["id"] for d in counted if key in d["edges"])
        silent = sorted(
            d["id"]
            for d in counted
            if key not in d["edges"] and key[0] in d["nodes"] and key[2] in d["nodes"]
        )
        if silent:
            out.append(["relationship", _link(key), "", say, silent])
    return _sorted(out)


def _numeric_certainty(counted: list[dict[str, Any]]) -> list[list[Any]]:
    """A certainty written as a number, in any counted document."""
    return _sorted(
        ["numeric-certainty", nid, k, d["id"]]
        for d in counted
        for nid, n in d["nodes"].items()
        for k in CERTAINTY_PROPS
        if _number(n["props"].get(k))
    )


def _claims(joined: dict[str, Any]) -> list[dict[str, Any]]:
    """The claims a person can rank: the join's own, and the Claim things the documents hold."""
    keys = ("likelihood", "likelihood_to", "confidence", "status")
    return [{"id": c["id"], **{k: c.get(k) for k in keys}} for c in joined["claims"].values()] + [
        {"id": nid, **{k: n["props"].get(k) for k in keys}}
        for nid, n in joined["nodes"].items()
        if "Claim" in n["labels"]
    ]


def _members(joined: dict[str, Any]) -> dict[str, list[str]]:
    """The members of each written cluster in the joined graph."""
    members: dict[str, list[str]] = {}
    for key in joined["edges"]:
        if key[1] == "MEMBER_OF":
            members.setdefault(key[2], []).append(key[0])
    return members


def _standings(
    joined: dict[str, Any], members: dict[str, list[str]], spread: Collection[str]
) -> dict[str, str]:
    """Each thing's standing: contested when a claim about its own labels or properties is,
    asserted otherwise. A dispute about a relationship stays on the relationship. A cluster named
    in `spread` passes doubt to its members."""
    standing = {nid: "asserted" for nid in joined["nodes"]}
    for c in joined["claims"].values():
        subject = c["_about"][0][1]
        if c["status"] == "contested" and "claimed_relationship" not in c and subject in standing:
            standing[subject] = "contested"
    for cluster in spread:
        ms = members.get(cluster, [])
        if not any(standing.get(m) == "contested" for m in ms):
            continue
        for m in ms:
            if standing.get(m) == "asserted":
                standing[m] = "in-doubt"
    return standing


def _links(joined: dict[str, Any], standing: dict[str, str]) -> list[list[Any]]:
    """Each link's standing, and the marker on a link from a contested thing to one that is not."""
    disputed = {
        _link((c["_about"][0][1], c["claimed_relationship"], c["_about"][1][1]))
        for c in joined["claims"].values()
        if c["status"] == "contested" and "claimed_relationship" in c
    }
    return _sorted(
        [
            _link(key),
            "contested" if _link(key) in disputed else "asserted",
            (standing.get(key[0]) == "contested") != (standing.get(key[2]) == "contested"),
        ]
        for key in joined["edges"]
    )


def _clusters(
    joined: dict[str, Any], counted: list[dict[str, Any]], standing: dict[str, str]
) -> list[list[Any]]:
    """The hand-made clusters: each starts asserted. One becomes contested when a claim about it
    is, or when a document holding both it and a member leaves out the membership another
    states."""
    out = []
    for cid, n in joined["nodes"].items():
        if "Cluster" not in n["labels"]:
            continue
        disputed = {
            key[0]
            for key in joined["edges"]
            if key[1] == "MEMBER_OF"
            and key[2] == cid
            and any(
                key not in d["edges"] and key[0] in d["nodes"] and cid in d["nodes"]
                for d in counted
            )
        }
        contested = bool(disputed) or standing.get(cid) == "contested"
        out.append([cid, "contested" if contested else "asserted", sorted(disputed)])
    return _sorted(out)


def _states(
    counted: list[dict[str, Any]], same_domain: Collection[Collection[str]]
) -> list[list[Any]]:
    """The states of the joined machines that share a name across documents. A match is a guess
    until every pair of its documents is named as one domain in `same_domain`."""
    same = {tuple(sorted(p)) for p in same_domain}
    by_name: dict[str, dict[str, set[str]]] = {}
    for d in counted:
        for nid, n in d["nodes"].items():
            if "State" not in n["labels"]:
                continue
            name = str(n["props"].get("name", nid))
            entry = by_name.setdefault(name, {"ids": set(), "docs": set()})
            entry["ids"].add(nid)
            entry["docs"].add(d["id"])
    out = []
    for name, entry in by_name.items():
        if len(entry["docs"]) < 2:
            continue
        ds = sorted(entry["docs"])
        pairs = [(a, b) for i, a in enumerate(ds) for b in ds[i + 1 :]]
        match = "confirmed" if all(p in same for p in pairs) else "guess"
        out.append([name, sorted(entry["ids"]), ds, match])
    return _sorted(out)


def mesh_join(
    docs: Iterable[dict[str, Any]],
    C: dict[str, Any],  # noqa: N803  # as the other join steps name it
    findings: Collection[dict[str, Any]] = (),
    spread: Collection[str] = (),
    same_domain: Collection[Collection[str]] = (),
) -> dict[str, Any]:
    """Documents joined as the mesh joins them: the §21 join, then what it found. `spread` names
    clusters whose doubt passes to their members; `same_domain` names pairs of documents the user
    has said are one domain."""
    docs = list(docs)
    joined = join(docs, C, findings)
    counted, _ = held_by_trust(docs, C, [])  # what the join counted: refused things already gone
    members = _members(joined)
    standing = _standings(joined, members, spread)
    states = _states(counted, same_domain)
    for _name, ids, _ds, match in states:
        if match == "guess":
            for nid in ids:
                if standing.get(nid) == "asserted":
                    standing[nid] = "guess"
    claims = _claims(joined)
    return {
        "conflicts": _conflicts(joined),
        "gaps": _gaps(joined, counted),
        "claims": by_certainty(claims),
        "shaky": [c["id"] for c in by_certainty(claims, shaky=True)],
        "flags": _numeric_certainty(counted),
        "standing": dict(sorted(standing.items())),
        "links": _links(joined, standing),
        "clusters": _clusters(joined, counted, standing),
        "states": states,
        "nodes": {
            k: {p: norm(v) for p, v in sorted(n["props"].items())}
            for k, n in sorted(joined["nodes"].items())
        },
    }
