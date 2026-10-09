"""§21 the three-way merge of two revisions of one earlier version."""

from __future__ import annotations

from typing import Any

from graphspec.engine.joining.claims import add_claim, ident_str, new_J, vtext
from graphspec.engine.joining.config import ABSENT


def merge3(
    base: dict[str, Any],
    a: dict[str, Any],
    b: dict[str, Any],
    C: dict[str, Any],  # noqa: N803  # public signature
    hold: bool = True,
) -> dict[str, Any]:
    """Two revisions of one earlier version: a change made on one side only is kept — including a
    removal; changes on both sides that differ are contested."""
    joined = new_J()

    def slots(d):
        s = {}
        for nid, n in d["nodes"].items():
            s[("node", nid)] = True
            s.update({("label", nid, label): True for label in n["labels"]})
            s.update({("prop", nid, k): v for k, v in n["props"].items() if k != "id"})
        for k, p in d["edges"].items():
            s[("edge", k)] = True
            s.update({("eprop", k, x): v for x, v in p.items()})
        return s

    base_slots, a_slots, b_slots = slots(base), slots(a), slots(b)
    res, from_ = {}, {}
    joined["superseded"] = {a["id"]: set(), b["id"]: set()}
    changed_presence = set()

    def belongs(s, n):
        return (s[0] in ("node", "label", "prop") and s[1] == n) or (
            s[0] in ("edge", "eprop") and n in (s[1][0], s[1][2])
        )

    # a node removed in one revision and changed in the other: the removal is contested, not
    # applied
    held_back = {}
    for n in sorted(s[1] for s in base_slots if s[0] == "node"):
        for (dl, dl_slots), (kp, kp_slots) in (
            ((a, a_slots), (b, b_slots)),
            ((b, b_slots), (a, a_slots)),
        ):
            if (
                hold
                and ("node", n) not in dl_slots
                and ("node", n) in kp_slots
                and any(
                    belongs(s, n)
                    and s[0] != "node"
                    and kp_slots.get(s, ABSENT) != base_slots.get(s, ABSENT)
                    for s in set(base_slots) | set(kp_slots)
                )
            ):
                held_back[n] = (dl, kp, kp_slots)
    held_edges = {}
    for k in sorted({s[1] for s in base_slots if s[0] == "edge"}, key=str) if hold else []:
        if k[0] in held_back or k[2] in held_back:
            continue
        for (dl, dl_slots), (kp, kp_slots) in (
            ((a, a_slots), (b, b_slots)),
            ((b, b_slots), (a, a_slots)),
        ):
            if (
                ("edge", k) not in dl_slots
                and ("edge", k) in kp_slots
                and any(
                    s[0] == "eprop"
                    and s[1] == k
                    and kp_slots.get(s, ABSENT) != base_slots.get(s, ABSENT)
                    for s in set(base_slots) | set(kp_slots)
                )
            ):
                held_edges[k] = (dl, kp, kp_slots)
    for s in sorted(set(base_slots) | set(a_slots) | set(b_slots), key=str):
        o, x, y = base_slots.get(s, ABSENT), a_slots.get(s, ABSENT), b_slots.get(s, ABSENT)
        hb = [n for n in held_back if belongs(s, n)]
        he = [k for k in held_edges if s[0] in ("edge", "eprop") and s[1] == k]
        if he and not hb:
            dl, kp, kp_slots = held_edges[he[0]]
            yv = kp_slots.get(s, ABSENT)
            k = he[0]
            if s == ("edge", k):
                res[s] = True
                from_[s] = [kp["id"]]
                about = [("subject", k[0]), ("object", k[2])]
                joined["pairs"].append(
                    tuple(
                        sorted(
                            (
                                add_claim(
                                    joined,
                                    k[0],
                                    f"{k[1]}-{k[2]}/{ident_str(k)}/exists=removed",
                                    [dl["id"]],
                                    ("exists",) + k,
                                    about,
                                    claimed_relationship=k[1],
                                    edge_ident=ident_str(k),
                                    _key=k,
                                    claimed_absent=True,
                                ),
                                add_claim(
                                    joined,
                                    k[0],
                                    f"{k[1]}-{k[2]}/{ident_str(k)}/exists=kept",
                                    [kp["id"]],
                                    ("exists",) + k,
                                    about,
                                    claimed_relationship=k[1],
                                    edge_ident=ident_str(k),
                                    _key=k,
                                    claimed_exists=True,
                                ),
                            )
                        )
                    )
                )
                joined["report"].append(
                    (
                        "delete-v-change",
                        k[0],
                        "edge",
                        f"{' '.join(map(str, k[:3]))} — {dl['id']}: removed · {kp['id']}: "
                        "kept and changed",
                        "REMOVED IN ONE, CHANGED IN THE OTHER — the removal is contested, "
                        "not applied",
                        "find evidence; a finding confirms one",
                    )
                )
                continue
            if yv == o:
                if yv != ABSENT:
                    res[s] = yv
                    from_[s] = [kp["id"]]
                continue
            x, y = (ABSENT, yv) if dl is a else (yv, ABSENT)
        if hb:
            dl, kp, kp_slots = held_back[hb[0]]
            yv = kp_slots.get(s, ABSENT)
            if s == ("node", hb[0]):
                res[s] = True
                from_[s] = [kp["id"]]
                joined["pairs"].append(
                    tuple(
                        sorted(
                            (
                                add_claim(
                                    joined,
                                    s[1],
                                    "exists=removed",
                                    [dl["id"]],
                                    ("exists", s[1]),
                                    [("subject", s[1])],
                                    claimed_node=s[1],
                                    claimed_absent=True,
                                ),
                                add_claim(
                                    joined,
                                    s[1],
                                    "exists=kept",
                                    [kp["id"]],
                                    ("exists", s[1]),
                                    [("subject", s[1])],
                                    claimed_node=s[1],
                                    claimed_exists=True,
                                ),
                            )
                        )
                    )
                )
                joined["report"].append(
                    (
                        "delete-v-change",
                        s[1],
                        "node",
                        f"{dl['id']}: removed · {kp['id']}: kept and changed",
                        "REMOVED IN ONE, CHANGED IN THE OTHER — the removal is contested, "
                        "not applied",
                        "find evidence; a finding confirms one",
                    )
                )
                continue
            if yv == o:
                if yv != ABSENT:
                    res[s] = yv
                    from_[s] = [kp["id"]]
                continue
            x, y = (ABSENT, yv) if dl is a else (yv, ABSENT)
        if x == y:
            r, src, cat = x, [a["id"], b["id"]], ("both-same" if x != o else None)
        elif hb or he:
            r, src, cat = ABSENT, [], "remove-v-change"
        elif x == o:
            r, src, cat = (
                y,
                [b["id"]],
                "one-side-"
                + ("addition" if o == ABSENT else "removal" if y == ABSENT else "change"),
            )
        elif y == o:
            r, src, cat = (
                x,
                [a["id"]],
                "one-side-"
                + ("addition" if o == ABSENT else "removal" if x == ABSENT else "change"),
            )
        else:
            r, src, cat = ABSENT, [], "remove-v-change" if ABSENT in (x, y) else "both-differ"
        if cat and s[0] in ("node", "edge"):
            changed_presence.add(s[1])
        if cat in (
            "one-side-change",
            "one-side-removal",
        ):  # the unchanged side's copy is superseded by the other side's edit
            loser = a if src == [b["id"]] else b
            v = base_slots[s]
            joined["superseded"][loser["id"]] |= (
                {("prop", s[1], s[2], v)}
                if s[0] == "prop"
                else {("eprop",) + s[1] + (s[2], v)}
                if s[0] == "eprop"
                else {("edge",) + s[1]}
                if s[0] == "edge"
                else {("label", s[1], s[2])}
                if s[0] == "label"
                else set()
            )
        if cat in ("both-differ", "remove-v-change"):
            subj = s[1] if s[0] == "prop" else s[1][0]
            about = (
                [("subject", subj)]
                if s[0] == "prop"
                else [("subject", s[1][0]), ("object", s[1][2])]
            )
            ids = []
            for d, v in ((a["id"], x), (b["id"], y)):
                extra = dict(claimed_absent=True) if v == ABSENT else dict(claimed_value=v)
                if s[0] == "prop":
                    ids.append(
                        add_claim(
                            joined,
                            subj,
                            f"{s[2]}={'removed' if v == ABSENT else vtext(v)}",
                            [d],
                            s,
                            about,
                            claimed_property=s[2],
                            **extra,
                        )
                    )
                else:
                    ids.append(
                        add_claim(
                            joined,
                            subj,
                            f"{s[1][1]}-{s[1][2]}/{ident_str(s[1])}/"
                            f"{s[2]}={'removed' if v == ABSENT else vtext(v)}",
                            [d],
                            s,
                            about,
                            claimed_relationship=s[1][1],
                            claimed_property=s[2],
                            edge_ident=ident_str(s[1]),
                            _key=s[1],
                            **extra,
                        )
                    )
            joined["pairs"].append(tuple(sorted(ids)))
        if r != ABSENT:
            res[s] = r
            from_[s] = src
        if cat:
            joined["report"].append(
                (
                    cat,
                    s[1] if s[0] in ("node", "prop", "label") else s[1][0],
                    s[0]
                    if s[0] in ("node", "edge")
                    else s[2]
                    if s[0] in ("prop", "label")
                    else f"{s[1][1]} {s[2]}",
                    f"base: {'—' if o == ABSENT else o} · {a['id']}: "
                    f"{'—' if x == ABSENT else x} · {b['id']}: {'—' if y == ABSENT else y}"
                    if s[0] in ("prop", "eprop")
                    else f"{s[0]} {s[1] if s[0] == 'node' else ' '.join(map(str, s[1][:3]))}",
                    {
                        "both-same": "agreed — both made the same change",
                        "one-side-addition": "added in one revision only — kept",
                        "one-side-removal": "removed in one revision only — removed",
                        "one-side-change": "changed in one revision only — the change is kept",
                        "both-differ": "BOTH CHANGED, DIFFERENTLY — contested",
                        "remove-v-change": "REMOVED IN ONE, CHANGED IN THE OTHER — contested",
                    }[cat],
                    "find evidence; a finding confirms one"
                    if cat in ("both-differ", "remove-v-change")
                    else "—",
                    s,
                )
            )
    # hide a detail row only when its own node or relationship was added or removed whole —
    # reported once, on its own row
    joined["report"] = [
        r[:6]
        for r in joined["report"]
        if not (
            len(r) > 6
            and r[6][0] in ("label", "prop", "eprop")
            and r[6][1] in changed_presence
            and r[0] in ("one-side-addition", "one-side-removal", "both-same")
        )
    ]
    for s, v in res.items():
        if s[0] == "node":
            joined["nodes"][s[1]] = {
                "labels": set(),
                "props": {"id": s[1]},
                "stated_in": sorted(
                    set(from_[s]) | {d["id"] for d in (a, b) if s[1] in d["nodes"]}
                ),
            }
    for s, v in res.items():
        if s[0] == "label" and s[1] in joined["nodes"]:
            joined["nodes"][s[1]]["labels"].add(s[2])
        if s[0] == "prop" and s[1] in joined["nodes"]:
            joined["nodes"][s[1]]["props"][s[2]] = v
            joined["src"][(s[1], s[2])] = from_[s]
        if s[0] == "edge":
            joined["edges"][s[1]] = {}
            joined["esrc"][s[1]] = sorted({d["id"] for d in (a, b) if s[1] in d["edges"]})
    for s, v in res.items():
        if s[0] == "eprop" and s[1] in joined["edges"]:
            joined["edges"][s[1]][s[2]] = v
    return joined
