"""§21 the union of two or more documents: agreement asserted, real differences contested."""

from __future__ import annotations

from collections.abc import Iterable
from itertools import combinations
from typing import Any

from graphspec.engine.joining.claims import add_claim, ident_str, new_J, vtext
from graphspec.engine.joining.restating import compatible, refines


def union(docs: Iterable[dict[str, Any]], C: dict[str, Any]) -> dict[str, Any]:  # noqa: N803  # public signature
    """Two or more documents: agreement and addition asserted, real differences contested — one
    claim per distinct statement."""
    docs = list(
        {d["id"]: d for d in docs}.values()
    )  # a document given twice is one source, not two
    joined = new_J()
    for nid in sorted({i for d in docs for i in d["nodes"]}):
        sources = [d for d in docs if nid in d["nodes"]]
        labels_by_doc = {d["id"]: frozenset(d["nodes"][nid]["labels"]) for d in sources}
        if all(a <= b or b <= a for a, b in combinations(set(labels_by_doc.values()), 2)):
            labels = set().union(*labels_by_doc.values())
            if len(set(labels_by_doc.values())) > 1:
                joined["report"].append(
                    (
                        "labels-refine",
                        nid,
                        "labels",
                        " / ".join(
                            f"{d}: {':'.join(sorted(doc_labels))}"
                            for d, doc_labels in labels_by_doc.items()
                        ),
                        "refined — one adds to the other",
                        "—",
                    )
                )
        else:
            labels = set(frozenset.intersection(*labels_by_doc.values()))
            by = {}
            for d, doc_labels in labels_by_doc.items():
                by.setdefault(doc_labels, []).append(d)
            ids = {
                doc_labels: add_claim(
                    joined,
                    nid,
                    "label/" + ":".join(sorted(doc_labels - labels)),
                    ds,
                    (nid, "label"),
                    [("subject", nid)],
                    claimed_label=":".join(sorted(doc_labels - labels)),
                )
                for doc_labels, ds in by.items()
            }
            joined["pairs"] += [
                tuple(sorted((ids[a], ids[b])))
                for a, b in combinations(by, 2)
                if not (a <= b or b <= a)
            ]
            joined["report"].append(
                (
                    "identity",
                    nid,
                    "labels",
                    " / ".join(
                        f"{d}: {':'.join(sorted(doc_labels))}"
                        for d, doc_labels in labels_by_doc.items()
                    ),
                    "IDENTITY CONFLICT — contested",
                    "check what it is — a register or the party itself",
                )
            )
        props = {}
        for k in sorted({k for d in sources for k in d["nodes"][nid]["props"]}):
            vals = {
                d["id"]: d["nodes"][nid]["props"][k]
                for d in sources
                if k in d["nodes"][nid]["props"]
            }
            distinct = list(dict.fromkeys(vals.values()))
            if len(distinct) == 1:
                props[k] = distinct[0]
                joined["src"][(nid, k)] = sorted(vals)
                continue
            best = [v for v in distinct if all(v == w or refines(v, w) for w in distinct)]
            if best:
                props[k] = best[0]
                joined["src"][(nid, k)] = sorted(d for d, v in vals.items() if v == best[0])
                joined["report"].append(
                    (
                        "refine",
                        nid,
                        k,
                        " / ".join(f"{d}: {v}" for d, v in vals.items()),
                        "refined — the more precise is kept",
                        "—",
                    )
                )
                continue
            by = {}
            for d, v in vals.items():
                by.setdefault(v, []).append(d)
            ids = {
                v: add_claim(
                    joined,
                    nid,
                    f"{k}={vtext(v)}",
                    ds,
                    (nid, k),
                    [("subject", nid)],
                    claimed_property=k,
                    claimed_value=v,
                )
                for v, ds in by.items()
            }
            joined["pairs"] += [
                tuple(sorted((ids[a], ids[b])))
                for a, b in combinations(by, 2)
                if not compatible(a, b)
            ]
            joined["report"].append(
                (
                    "value",
                    nid,
                    k,
                    " / ".join(f"{d}: {v}" for d, v in vals.items()),
                    "VALUE CONFLICT — contested",
                    "find evidence; a finding confirms one",
                )
            )
        joined["nodes"][nid] = {
            "labels": labels,
            "props": props,
            "stated_in": sorted(d["id"] for d in sources),
        }
    for key in sorted({k for d in docs for k in d["edges"]}, key=str):
        sources = [d for d in docs if key in d["edges"]]
        p = {}
        for k in sorted({k for d in sources for k in d["edges"][key]}):
            vals = {d["id"]: d["edges"][key][k] for d in sources if k in d["edges"][key]}
            distinct = list(dict.fromkeys(vals.values()))
            if len(distinct) == 1:
                p[k] = distinct[0]
                continue
            by = {}
            for d, v in vals.items():
                by.setdefault(v, []).append(d)
            ids = {
                v: add_claim(
                    joined,
                    key[0],
                    f"{key[1]}-{key[2]}/{ident_str(key)}/{k}={vtext(v)}",
                    ds,
                    key + (k,),
                    [("subject", key[0]), ("object", key[2])],
                    claimed_relationship=key[1],
                    claimed_property=k,
                    claimed_value=v,
                    edge_ident=ident_str(key),
                    _key=key,
                )
                for v, ds in by.items()
            }
            joined["pairs"] += [tuple(sorted((ids[a], ids[b]))) for a, b in combinations(by, 2)]
            joined["report"].append(
                (
                    "attribute",
                    key[0],
                    f"{key[1]} {k}",
                    " / ".join(f"{d}: {v}" for d, v in vals.items()),
                    "ATTRIBUTE CONFLICT on a shared relationship — contested",
                    "find evidence; a finding confirms one",
                )
            )
        joined["edges"][key] = p
        joined["esrc"][key] = sorted(d["id"] for d in sources)
    return joined
