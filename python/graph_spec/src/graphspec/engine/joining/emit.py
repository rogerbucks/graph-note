"""§21 a joined graph written out as one GQL block, stamped with the host's engine and
author."""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable
from typing import Any

from graphspec.engine import settings


def emit(
    J: dict[str, Any],  # noqa: N803  # public signature
    docs: Iterable[dict[str, Any]],
    C: dict[str, Any],  # noqa: N803  # public signature
    name: str = "join",
) -> str:
    """A finished join as one GQL block for graph joined: its GraphMeta, stamped with the host's
    engine and author, then its types, documents, nodes, claims, relationships, paradoxes and
    findings."""

    def q(s):
        return "'" + str(s).replace("'", "\\'") + "'"

    def val(v):
        return (
            ("TRUE" if v else "FALSE")
            if isinstance(v, bool)
            else repr(v)
            if isinstance(v, (int, float))
            else f"DATE '{v.isoformat()}'"
            if isinstance(v, dt.date)
            else q(v)
        )

    def props(p):
        return ", ".join(f"{k}: {val(v)}" for k, v in sorted(p.items()) if v is not None)

    lines = [
        f" (meta:GraphMeta {{id: 'meta:{name}', graph: 'joined', schema: 'joined@1', "
        f"owner_engine: '{settings.OWNER_ENGINE}', written_by: '{settings.WRITTEN_BY}'}})"
    ]
    element_types = (
        C["types"]
        + [("node", n, None) for n in ("Claim", "Document", "Activity", "Finding", "Paradox")]
        + [
            ("edge", e, r)
            for e, r in (
                ("ABOUT", "is the subject of"),
                ("CONTRADICTS", "contradicts"),
                ("IN_PARADOX", "holds"),
                ("CONFIRMS", "is confirmed by"),
                ("REFUTES", "is refuted by"),
                ("USED", "was used by"),
            )
        ]
    )
    edge_readings = {
        "ABOUT": "is about",
        "CONTRADICTS": "contradicts",
        "IN_PARADOX": "is in paradox",
        "CONFIRMS": "confirms",
        "REFUTES": "refutes",
        "USED": "used",
    } | C.get("readings", {})
    for i, (k, n, r) in enumerate(element_types):
        lines += [
            f" (t{i}:Meta:ElementType {{id: 'meta:joined:{n}', kind: '{k}', "
            f"name: '{n}', origin: 'source'"
            + (f", reading: '{edge_readings[n]}'" if k == "edge" and n in edge_readings else "")
            + (f", reverse_name: '{r}'" if r else "")
            + "})",
            f" (meta)-[:DECLARES]->(t{i})",
        ]
    var = {}
    for d in docs:
        var[d["id"]] = f"d{len(var)}"
        said = {
            "id": d["id"],
            "schema": d["schema"],
            "as_of": d["as_of"],
            "revision_of": d.get("revision_of"),
        }
        lines.append(f" ({var[d['id']]}:Document {{{props(said)}}})")
    lines.append(f" (act:Activity {{id: 'join:{name}', rule: 'rule:join@1'}})")
    lines += [f" (act)-[:USED]->({var[d['id']]})" for d in docs]
    for nid, n in sorted(J["nodes"].items()):
        var[nid] = f"n{len(var)}"
        lines.append(
            f" ({var[nid]}:{':'.join(sorted(n['labels'])) or 'Party'} "
            f"{{{props({**n['props'], 'stated_in': ' '.join(n['stated_in'])})}}})"
        )
    for cid, c in sorted(J["claims"].items()):
        gone = [t for r, t in c["_about"] if t not in J["nodes"]]
        var[cid] = f"c{len(var)}"
        own = {k: v for k, v in c.items() if not k.startswith("_") and v != ""}
        removed = {"about_removed": " ".join(gone)} if gone else {}
        lines.append(f" ({var[cid]}:Claim {{{props({**own, **removed})}}})")
        lines += [
            f" ({var[cid]})-[:ABOUT {{role: '{r}'}}]->({var[t]})"
            for r, t in c["_about"]
            if t in J["nodes"]
        ]
    for k, p in sorted(J["edges"].items(), key=str):
        lines.append(
            f" ({var[k[0]]})-[:{k[1]} "
            f"{{{props({**p, 'stated_in': ' '.join(J['esrc'][k])})}}}]->({var[k[2]]})"
        )
    lines += [f" ({var[a]})-[:CONTRADICTS]->({var[b]})" for a, b in J["pairs"]]
    for pid, why, ids in J["paradoxes"]:
        var[pid] = f"p{len(var)}"
        lines.append(f" ({var[pid]}:Paradox {{id: '{pid}', why: {q(why)}}})")
        lines += [f" ({var[c]})-[:IN_PARADOX]->({var[pid]})" for c in ids]
    for f in J["findings"]:
        var[f["id"]] = f"f{len(var)}"
        lines.append(f" ({var[f['id']]}:Finding {{id: '{f['id']}', kind: '{f['kind']}'}})")
        lines += [f" ({var[f['id']]})-[:CONFIRMS]->({var[f['confirms']]})"] + [
            f" ({var[f['id']]})-[:REFUTES]->({var[x]})" for x in f["refutes"]
        ]
    return "// graph: joined · DERIVED by rule:join@1\nINSERT\n" + ",\n".join(lines)
