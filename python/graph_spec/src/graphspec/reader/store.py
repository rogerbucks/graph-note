"""The in-memory graph store data blocks are applied to, whole or not at all — no database."""

from __future__ import annotations

import copy
import re

from graphspec.reader.grammar import Parser
from graphspec.reader.lexer import ProfileError, header, tokens
from graphspec.reader.whitespace import N, S, strip

SHARED = re.compile(rf"·{S}*SCHEMA{S}+({N}+)")
NAMES_SHARED = re.compile(rf"·{S}*schema{S}+({N}+)")


class Store:
    """Graphs built from data blocks, in the order they are applied — {graph: {'nodes': {key:
    {'labels', 'props'}}, 'edges': [...]}}."""

    def __init__(self):
        self.graphs = {}
        self._k = 0
        self.schemas = {}
        self.named = {}
        # schema name -> its graph; data graph -> the schema its header names; commas: [{graph,
        # line}] where a missing comma was read in (§3); _commas: where each is written in, by
        # block text
        self.commas = []
        self._commas = {}
        # bares: [{graph, line, written, type}] where a type written without its colon was read as
        # the graph's one type of that name, ignoring case (§3); _fixes: [(at, written, type)],
        # where each begins in its block, by block text
        self.bares = []
        self._fixes = {}

    def graph(self, g):
        """The graph named g, made empty the first time it is asked for."""
        return self.graphs.setdefault(g, {"nodes": {}, "edges": []})

    def find(self, g, nid):
        """The store's key of the node in graph g whose id is nid, or None."""
        return next(
            (k for k, n in self.graph(g)["nodes"].items() if n["props"].get("id") == nid), None
        )

    def edge_types(self, g):
        """The relationship types graph g knows so far: written with their colon, declared by an
        ElementType, or in the shared schema it names."""
        out = set()
        for name in [g] + (
            [self.schemas[self.named[g]]] if self.named.get(g) in self.schemas else []
        ):
            stored = self.graph(name)
            out |= {e[1] for e in stored["edges"]}
            out |= {
                n["props"].get("name")
                for n in stored["nodes"].values()
                if "ElementType" in n["labels"] and n["props"].get("kind") == "edge"
            }
        return {t for t in out if isinstance(t, str)}

    def _resolve(self, g, r, block):
        """A bare type read as the graph's one type of that name, ignoring case — or refused."""
        written = r["type"]
        found = sorted(t for t in self.edge_types(g) if t.lower() == written.lower())
        if not found:
            raise ProfileError(
                r["line"],
                f"[{written}] has no colon, and graph {g} has no relationship type called "
                f"{written}",
                f"a relationship type is written with its colon: [:{written.upper()}]",
                code="GN301",
            )
        if len(found) > 1:
            raise ProfileError(
                r["line"],
                f"[{written}] has no colon, and graph {g} has relationship types "
                f"{', '.join(found[:-1])} and {found[-1]}, which differ only by case",
                f"write the one meant with its colon, such as [:{found[0]}]",
                code="GN302",
            )
        self.bares.append({"graph": g, "line": r["line"], "written": written, "type": found[0]})
        self._fixes.setdefault(block, []).append((r["at"], written, found[0]))
        return found[0]

    def corrected(self, block):
        """The block with each bare type this store read written with its colon, as its graph
        spells it, and each missing comma it read in written at the end of the code on its line —
        the text an engine may be given (req:3.engine-gets-corrected, req:3.engine-gets-commas).
        No line is added (req:3.engine-text-keeps-lines). Each is put where the reader read it — a
        bare type where its token begins, a comma where the code on its line ends — never found by
        searching the text."""
        edits = [
            (at, len(written), ":" + typ) for at, written, typ in self._fixes.get(block, [])
        ] + [(at, 0, ",") for at in self._commas.get(block, [])]
        out = block
        for at, cut, text in sorted(edits, reverse=True):
            out = out[:at] + text + out[at + cut :]
        return out

    def apply(self, block):
        """Applies a data block whole, or not at all: a block that cannot be read, or whose reading
        fails in any other way, an interrupt among them, leaves the store as it was, however far
        its reading got, as the JavaScript store does (req:3.engine-gets-corrected)."""
        kept = copy.deepcopy(
            (
                self.graphs,
                self._k,
                self.schemas,
                self.named,
                self.commas,
                self._commas,
                self.bares,
                self._fixes,
            )
        )
        try:
            return self._apply(block)
        except BaseException:  # an interrupt too: the store is restored, and it is raised again
            (
                self.graphs,
                self._k,
                self.schemas,
                self.named,
                self.commas,
                self._commas,
                self.bares,
                self._fixes,
            ) = kept
            raise

    def _apply(self, block):
        g, kind = header(block)
        if kind == "query":
            raise ProfileError(
                1,
                "this is a query block",
                "queries ask questions of a graph; they are not data",
                code="GN303",
            )
        if kind == "excerpt":
            raise ProfileError(
                1,
                "this is an excerpt",
                "an excerpt illustrates part of a graph; it is not data",
                code="GN304",
            )
        first = next((line for line in block.split("\n") if strip(line)), "")
        if kind == "schema":  # a shared schema (§5): kept apart from the data, under its own name
            name = SHARED.search(first).group(1)
            g = "schema " + name
            self.schemas[name] = g
            self.graphs.pop(g, None)
        else:
            m = NAMES_SHARED.search(first)
            if m:
                self.named[g] = m.group(1)
        toks = tokens(block)
        if not toks:
            return g
        parser = Parser(toks)
        matches, paths, sets = parser.statement()
        self.commas.extend({"graph": g, "line": n} for n, _ in parser.commas)
        # kept only for a block that has some. So a store that reads many blocks (a block read
        # again in part) keeps few, and copies few in apply
        if parser.commas:
            self._commas[block] = [at for _, at in parser.commas]
        else:
            self._commas.pop(block, None)
        self._fixes.pop(block, None)  # made again as each bare type is resolved, below
        graph = self.graph(g)
        bound = {}
        # each id's node, the first in order, as find() gives it. It is indexed once for the block,
        # not searched for each thing, as the JavaScript store reads it. So a block of thousands of
        # things is read in time linear in them (editor spec §9: never freeze)
        ids = None

        def found(nid):
            nonlocal ids
            if ids is None:
                ids = {}
                for k, node in graph["nodes"].items():
                    ids.setdefault(node["props"].get("id"), k)
            return ids.get(nid)

        for m in matches:
            if set(m["props"]) != {"id"}:
                raise ProfileError(
                    m["line"],
                    "MATCH must find a thing by its id alone",
                    "write MATCH (v:Label {id: '…'})",
                    code="GN305",
                )
            k = found(m["props"]["id"])
            if k is None or not set(m["labels"]) <= graph["nodes"][k]["labels"]:
                raise ProfileError(
                    m["line"],
                    f"MATCH finds no {':'.join(m['labels'])} with id {m['props']['id']!r} "
                    f"in graph {g}",
                    "the thing must be written earlier — in this document or one loaded before it",
                    code="GN306",
                )
            bound[m["var"]] = k
        # left to right, as Grafeo binds them. A name is reused only once its node is written (§3):
        # earlier in the block, earlier in this path, or found by MATCH
        for nodes, rels in paths:
            for n in nodes:
                if n["labels"] or n["props"]:
                    if n["var"] in bound:
                        raise ProfileError(
                            n["line"],
                            f"{n['var']} is written twice",
                            "give each new thing its own variable",
                            code="GN307",
                        )
                    if "id" not in n["props"]:
                        # a thing's name is its id (§3, 6 Oct 2026)
                        n["props"] = {"id": n["var"], **n["props"]}
                    if found(n["props"]["id"]) is not None:
                        raise ProfileError(
                            n["line"],
                            f"id {n['props']['id']!r} is already a thing in graph {g}",
                            "an id names one thing — MATCH it to add to it, or supersede it",
                            code="GN308",
                        )
                    self._k += 1
                    k = f"n{self._k}"
                    graph["nodes"][k] = {"labels": set(n["labels"]), "props": dict(n["props"])}
                    if ids is not None:
                        ids.setdefault(n["props"]["id"], k)
                    bound[n["var"]] = k
                elif n["var"] not in bound:
                    later = any(
                        m["var"] == n["var"] and (m["labels"] or m["props"])
                        for ns, _ in paths
                        for m in ns
                    )
                    if later:
                        raise ProfileError(
                            n["line"],
                            f"{n['var']} is used before it is written",
                            "write the thing before any link that uses it",
                            code="GN309",
                        )
                    # a bare name not written in this block names the existing node with that
                    # id (§3)
                    k = found(n["var"])
                    if k is None:
                        raise ProfileError(
                            n["line"],
                            f"no thing called {n['var']} in graph {g}",
                            "check the spelling — or write it here with its kind: "
                            f"({n['var']}:Kind {{…}})",
                            code="GN310",
                        )
                    bound[n["var"]] = k
            for a, r, b in zip(nodes, rels, nodes[1:]):
                typ = self._resolve(g, r, block) if r.get("bare") else r["type"]
                graph["edges"].append((bound[a["var"]], typ, bound[b["var"]], dict(r["props"])))
        for var, key, val, n in sets:
            if var not in bound and found(var) is not None:
                bound[var] = found(var)  # SET name.key names the node with that id (§3)
            if var not in bound:
                raise ProfileError(
                    n,
                    f"SET names {var}, which is no thing in graph {g}",
                    "check the spelling — SET names a thing by its id",
                    code="GN311",
                )
            # never an id: the parser refuses a SET of one (§3, req:3.set-keeps-id), so the index
            # stays good
            graph["nodes"][bound[var]]["props"][key] = val
        return g
