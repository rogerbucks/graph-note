"""§21 trust on joined graphs (req:21.trust-counted, req:21.prefix-owner; editor spec §51,
spec_join_trust).

- A join may name each document's trust: own, trusted or untrusted. One it does not name is
  untrusted. A join that names none counts every document as own.
- Only own and trusted documents are joined. What only an untrusted one states is a flagged row.
  It is left out of the result, and is never a contested claim, until a person raises its level.
- An id prefix may have an owner. A thing under it from another document is refused, with the
  owner named, and the relationships to and from it go with it."""

from __future__ import annotations

from typing import Any

LEVELS = ("own", "trusted", "untrusted")
FLAGGED = "flagged — from an untrusted source, not counted until a person accepts it"


def _edge_text(key: tuple[Any, ...]) -> str:
    return f"{key[0]}-[:{key[1]}]->{key[2]}"


def _levels(docs: list[dict[str, Any]], trust: dict[str, str] | None) -> dict[str, str]:
    """The level of each document, by id. A level not in LEVELS is refused."""
    named = trust or {}
    for doc_id, level in named.items():
        if level not in LEVELS:
            raise ValueError(
                f"The trust of {doc_id} must be own, trusted or untrusted, not {level}"
            )
    return {d["id"]: "own" if not named else named.get(d["id"], "untrusted") for d in docs}


def _refuse_foreign(docs: list[dict[str, Any]], owners: dict[str, str], report: list) -> None:
    """Removes from each document the things under a prefix another document owns, and the
    relationships that touch them."""
    for d in docs:
        refused = set()
        for nid in list(d["nodes"]):
            prefix = nid.split(":", 1)[0] if ":" in nid else None
            owner = (owners or {}).get(prefix) if prefix is not None else None
            if owner is None or owner == d["id"]:
                continue
            refused.add(nid)
            del d["nodes"][nid]
            report.append(
                (
                    "prefix",
                    nid,
                    "id",
                    "",
                    f"refused — the prefix {prefix} belongs to {owner}",
                    d["id"],
                )
            )
        for key in [k for k in d["edges"] if k[0] in refused or k[2] in refused]:
            del d["edges"][key]


def held_by_trust(
    docs: list[dict[str, Any]],
    C: dict[str, Any],  # noqa: N803  # as the other join steps name it
    report: list,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """The documents a join counts, after refusing what is under another's prefix, and the
    untrusted ones held aside."""
    _refuse_foreign(docs, C.get("owners") or {}, report)
    levels = _levels(docs, C.get("trust"))
    return (
        [d for d in docs if levels[d["id"]] != "untrusted"],
        [d for d in docs if levels[d["id"]] == "untrusted"],
    )


def flag_untrusted(joined: dict[str, Any], untrusted: list[dict[str, Any]]) -> dict[str, Any]:
    """A flagged row on the joined result for each thing, value and relationship an untrusted
    document states that the counted ones do not."""

    def flag(subject: str, attribute: str, by: str) -> None:
        joined["report"].append(("untrusted", subject, attribute, "", FLAGGED, by))

    for d in untrusted:
        for nid in sorted(d["nodes"]):
            n, counted = d["nodes"][nid], joined["nodes"].get(nid)
            if counted is None:
                flag(nid, "thing", d["id"])
                continue
            for k in sorted(n["props"]):
                if k not in counted["props"] or counted["props"][k] != n["props"][k]:
                    flag(nid, k, d["id"])
        for key in d["edges"]:
            if key not in joined["edges"]:
                flag(_edge_text(key), "relationship", d["id"])
    return joined
