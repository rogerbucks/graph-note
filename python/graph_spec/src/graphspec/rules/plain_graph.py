"""The plain in-memory graph the rules run on, and the world of graphs a check reads."""

from __future__ import annotations


# ── the plain graph ──────────────────────────────────────────────────────────────────────────
class Graph:
    """A graph as the rules read it: nodes by id with their labels and properties, edges as
    (source, type, target, properties), indexed both ways for quick walks."""

    def __init__(self, nodes, edges):
        self.nodes = nodes  # {id: (frozenset(labels), {props})}
        self.edges = edges  # [(src id, type, dst id, {props})]
        self._out, self._in = {}, {}
        for e in edges:
            self._out.setdefault(e[0], []).append(e)
            self._in.setdefault(e[2], []).append(e)

    def labelled(self, label):
        """The ids of the nodes that carry this label."""
        return [i for i, (labels, _) in self.nodes.items() if label in labels]

    def p(self, i):
        """A node's properties, or an empty map for an id the graph does not hold."""
        return self.nodes[i][1] if i in self.nodes else {}

    def has(self, i, label):
        """Whether the node is in the graph and carries this label."""
        return i in self.nodes and label in self.nodes[i][0]

    def out(self, i, typ=None):
        """The edges leaving node i, of this type when one is given."""
        return [e for e in self._out.get(i, []) if typ is None or e[1] == typ]

    def inc(self, i, typ=None):
        """The edges reaching node i, of this type when one is given."""
        return [e for e in self._in.get(i, []) if typ is None or e[1] == typ]


class World:
    """Every graph a check reads, by name, with the shared schemas they may name instead of
    declaring their own types (§5)."""

    def __init__(self, graphs, schemas=None, named=None):
        self.graphs = graphs
        self.schemas = schemas or {}
        self.named = named or {}

    def schema_for(self, g):
        """The shared schema a graph names in its header, when it declares no types of its own
        (§5) — (name, Graph or None)."""
        name = self.named.get(g)
        return name, self.schemas.get(name)

    def __getitem__(self, g):
        return self.graphs[g]

    @staticmethod
    def from_store(store):
        """The world made from a reader's store: each graph's nodes keyed by their own ids."""
        out = {}
        for g, stored in store.graphs.items():
            byk = {k: n["props"]["id"] for k, n in stored["nodes"].items()}
            out[g] = Graph(
                {
                    n["props"]["id"]: (frozenset(n["labels"]), dict(n["props"]))
                    for n in stored["nodes"].values()
                },
                [(byk[s], t, byk[d], dict(p)) for s, t, d, p in stored["edges"]],
            )
        schemas = {
            name: out.pop(g) for name, g in getattr(store, "schemas", {}).items() if g in out
        }
        return World(out, schemas, dict(getattr(store, "named", {})))

    @staticmethod
    def from_rows(graphs):
        """{graph: (nodes [{'l': labels, 'p': props}],
        rels [{'s': src id, 'ty', 't': dst id, 'p'}])} — e.g. read out of any database."""
        return World(
            {
                g: Graph(
                    {n["p"]["id"]: (frozenset(n["l"]), dict(n["p"])) for n in node_rows},
                    [(r["s"], r["ty"], r["t"], dict(r["p"] or {})) for r in rel_rows],
                )
                for g, (node_rows, rel_rows) in graphs.items()
            }
        )
