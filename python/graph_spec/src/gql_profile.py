#!/usr/bin/env python3
"""Reads GQL data blocks in the graph spec's document profile into a plain in-memory graph — no
database — and computes the same canonical hash as the Grafeo checker.

Usage (in Python, from the repository root):
  import sys; sys.path.insert(0, 'python/graph_spec/src')
  import gql_profile as p
  s = p.Store(); s.apply(open('block.gql').read()); print(p.canon(s, 'ledger'))

Writes: nothing (library).

The document profile (§3) and its reader, so that systems without Grafeo can store, show and check
graphs. Standard library only, so it runs wherever Python does; the plain-JavaScript twin is
packages/graph-spec.

THE PROFILE — a data block, after its '// graph:' line, is one of:
  [INSERT] <element>, … [SET v.key = <value>, …]
      INSERT may be left out: a block that only lists things and links is data (6 Oct 2026)
  MATCH (v:Label {id: '…'}) [MATCH …] INSERT <element>, … [SET v.key = <value>, …]
  SET v.key = <value>, …
an element is a node (name:Label[:Label] {key: value, …}) or a path of nodes joined by
-[:TYPE {…}]->;
a value is 'text', a number, TRUE, FALSE, DATE '…' or DATETIME '…' with an offset; every node has
an id.
A thing's name is its id (6 Oct 2026): a new node with no id: takes its name as its id, and a bare
(name) — or SET name.key — not written in the block names the existing node with that id.
to_gql(block) puts back what the shortcuts leave out — INSERT, the id: and a MATCH for each
existing node named — the one conversion every route to a GQL engine goes through.
Blocks marked '// graph: G · QUERY' are queries, not data, and are refused here.
"""

import re
import hashlib
import datetime as dt

UTC = dt.timezone.utc


def _bare(block):
    """The line and name of the first relationship type written without its colon, if any."""
    try:
        toks = tokens(block)
    except ProfileError:
        return None
    for a, b, c in zip(toks, toks[1:], toks[2:]):
        if a[:2] == ("p", "-") and b[:2] == ("p", "[") and c[0] in ("id", "kw"):
            return c[2], c[3]
    return None


def to_gql(block):
    """A block as standard GQL (§3): the data shortcut's INSERT put back and, where a name stands
    for an id, the id: written on each new node and a MATCH added for each existing node named. A
    block using neither name shortcut keeps its lines and comments, with only INSERT added; one
    that does is rewritten whole, comments dropped. A block that cannot be read is returned as it
    is, so the engine reports it."""
    lines = block.split("\n")
    i = next(
        (k for k, line in enumerate(lines) if line.strip() and not line.strip().startswith("//")),
        None,
    )
    if i is None:
        return block
    bare = _bare(block)
    if bare:
        # no engine is given a block that still holds a bare type (req:3.engine-gets-corrected)
        line, written = bare
        raise ProfileError(
            line,
            f"[{written}] has no colon",
            "an engine is given only corrected text — read the block with its graph and load "
            f"Store.corrected(block), or write it with its colon: [:{written.upper()}]",
        )
    try:
        matches, paths, sets = Parser(tokens(block)).statement()
    except ProfileError:
        matches = paths = sets = None
    if matches is not None:
        matched = {m["var"] for m in matches}
        written = {n["var"] for ns, _ in paths for n in ns if n["labels"] or n["props"]}
        refs = list(
            dict.fromkeys(
                [
                    n["var"]
                    for ns, _ in paths
                    for n in ns
                    if not (n["labels"] or n["props"]) and n["var"] not in matched | written
                ]
                + [v for v, *_ in sets if v not in matched | written]
            )
        )
        if refs or any(
            "id" not in n["props"] for ns, _ in paths for n in ns if n["labels"] or n["props"]
        ):

            def node(n, new):
                props = ({"id": n["var"]} if new and "id" not in n["props"] else {}) | n["props"]
                body = ", ".join(f"{k}: {_gql_value(v)}" for k, v in props.items())
                labels = "".join(":" + label for label in n["labels"])
                return f"({n['var']}{labels}{' {' + body + '}' if body else ''})"

            def rel(r):
                body = ", ".join(f"{k}: {_gql_value(v)}" for k, v in r["props"].items())
                return f"-[:{r['type']}{' {' + body + '}' if r['props'] else ''}]->"

            def path(nodes, rels):
                return node(nodes[0], bool(nodes[0]["labels"] or nodes[0]["props"])) + "".join(
                    rel(r) + node(b, bool(b["labels"] or b["props"]))
                    for r, b in zip(rels, nodes[1:])
                )

            out = lines[:i]
            finds = [node(m, False) for m in matches] + [
                f"({v} {{id: {_gql_value(v)}}})" for v in refs
            ]
            if finds:
                out.append("MATCH " + ", ".join(finds))
            if paths:
                out += ["INSERT", ",\n".join(" " + path(*p) for p in paths)]
            if sets:
                out.append("SET " + ", ".join(f"{v}.{k} = {_gql_value(x)}" for v, k, x, _ in sets))
            return "\n".join(out)
    if not lines[i].lstrip().startswith("("):
        return block
    return "\n".join(lines[:i] + ["INSERT"] + lines[i:])


def _gql_value(v):
    """A profile value written back as GQL — the inverse of Parser.value."""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, dt.datetime):
        return f"DATETIME '{v.replace(tzinfo=UTC).isoformat()}'"
    if isinstance(v, dt.date):
        return f"DATE '{v.isoformat()}'"
    return (
        "'"
        + str(v)
        .replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\t", "\\t")
        + "'"
    )


class ProfileError(ValueError):
    def __init__(self, line, message, fix):
        super().__init__(f"line {line}: {message} — {fix}")
        self.line, self.message, self.fix = line, message, fix


TOKEN = re.compile(
    r"""\s*(?:(?P<str>'(?:[^'\\]|\\.)*')"""
    r"""|(?P<num>-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"""
    r"""|(?P<id>[A-Za-z_][A-Za-z0-9_]*)"""
    r"""|(?P<arrow>->)"""
    r"""|(?P<p>[()\[\]{}:,.=-]))"""
)
KEYWORDS = {"INSERT", "MATCH", "SET", "DATE", "DATETIME", "TRUE", "FALSE"}


def header(block):
    first = next((line for line in block.splitlines() if line.strip()), "")
    if re.match(r"\s*//\s*excerpt\b", first, re.I):
        return None, "excerpt"  # an illustration, said to be one (§3)
    m = re.match(r"\s*//\s*graph:\s*(\S+)(.*)$", first)
    if not m:
        raise ProfileError(1, "the block names no graph", "start it with '// graph: <name>' (§3)")
    rest = m.group(2)
    kind = (
        "schema"
        if re.search(r"·\s*SCHEMA\s+\S+", rest)
        else "excerpt"
        if re.search(r"·\s*excerpt\b", rest, re.I)
        else "query"
        if re.search(r"·\s*QUERY\b", rest)
        else "changeset"
        if re.search(r"·\s*CHANGE SET\b", rest)
        else "data"
    )
    # a GQL engine names a graph by an identifier — 'reader-choice' cannot be loaded
    if kind != "excerpt" and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", m.group(1)):
        raise ProfileError(
            1,
            f"the graph name {m.group(1)!r} is not one word",
            "use letters, digits and underscores only — reader_choice, not reader-choice (§3)",
        )
    return m.group(1), kind


def tokens(block):
    """(kind, text, line) for every token, whole-line comments removed — '//' also occurs inside
    ni:/// ids."""
    out = []
    for n, raw in enumerate(block.splitlines(), 1):
        if raw.strip().startswith("//"):
            continue
        pos = 0
        while pos < len(raw):
            if not raw[pos:].strip():
                break
            m = TOKEN.match(raw, pos)
            if not m:
                raise ProfileError(
                    n,
                    f"cannot read {raw[pos:].strip()[:20]!r}",
                    "a data block holds only nodes, relationships and simple values",
                )
            kind = m.lastgroup
            text = m.group(kind)
            raw_text = text
            if kind == "id" and text.upper() in KEYWORDS:
                kind, text = "kw", text.upper()
            out.append((kind, text, n, raw_text))
            pos = m.end()
    return out


class Parser:
    def __init__(self, toks):
        # commas: the lines a missing comma was read after (§3)
        self.t, self.i, self.commas = toks, 0, []

    def peek(self, k=0):
        return (
            self.t[self.i + k]
            if self.i + k < len(self.t)
            else ("end", "", self.t[-1][2] if self.t else 1, "")
        )

    def name(self):
        """A label, type, key or variable — a keyword in a name's place is a name (Grafeo 0.5.43
        accepts date, to and on as names)."""
        k, t, n, raw = self.peek()
        if k in ("id", "kw"):
            self.i += 1
            return raw
        raise ProfileError(
            n, f"expected a name, found {t or 'the end'!r}", "keep to the document profile (§3)"
        )

    def line(self):
        return self.peek()[2]

    def take(self, kind=None, text=None):
        tok = self.peek()
        if (kind and tok[0] != kind) or (text and tok[1] != text):
            want = text or kind
            raise ProfileError(
                tok[2],
                f"expected {want!r}, found {tok[1] or 'the end'!r}",
                "keep to the document profile (§3)",
            )
        self.i += 1
        return tok

    def at(self, kind=None, text=None):
        tok = self.peek()
        return (not kind or tok[0] == kind) and (not text or tok[1] == text)

    def value(self):
        k, t, n, _ = self.peek()
        if k == "str":
            self.i += 1
            return unquote(t)
        if k == "num":
            self.i += 1
            return float(t) if re.search(r"[.eE]", t) else int(t)
        if k == "kw" and t in ("TRUE", "FALSE"):
            self.i += 1
            return t == "TRUE"
        if k == "kw" and t == "DATE":
            self.i += 1
            s = unquote(self.take("str")[1])
            try:
                return dt.date.fromisoformat(s)
            except ValueError:
                raise ProfileError(n, f"{s!r} is not a date", "write DATE 'YYYY-MM-DD'")
        if k == "kw" and t == "DATETIME":
            self.i += 1
            s = unquote(self.take("str")[1])
            try:
                v = dt.datetime.fromisoformat(s)
            except ValueError:
                raise ProfileError(
                    n, f"{s!r} is not an instant", "write DATETIME 'YYYY-MM-DDTHH:MM:SS+HH:MM'"
                )
            if v.tzinfo is None:
                raise ProfileError(
                    n, f"{s!r} has no offset", "an instant carries its offset (§9, principle 11)"
                )
            # an instant as its UTC time, exactly as Grafeo returns it
            return v.astimezone(UTC).replace(tzinfo=None)
        raise ProfileError(
            n,
            f"{t or 'nothing'!r} is not a value in the profile",
            "use 'text', a number, TRUE, FALSE, DATE '…' or DATETIME '…' — "
            "no lists, no expressions",
        )

    def props(self):
        out = {}
        if not self.at("p", "{"):
            return out
        self.take("p", "{")
        while not self.at("p", "}"):
            key = self.name()
            self.take("p", ":")
            out[key] = self.value()
            if not self.at("p", "}"):
                self.take("p", ",")
        self.take("p", "}")
        return out

    def node(self):
        n = self.take("p", "(")[2]
        var = self.name()
        labels = []
        while self.at("p", ":"):
            self.take("p", ":")
            labels.append(self.name())
        props = self.props()
        self.take("p", ")")
        return {"var": var, "labels": labels, "props": props, "line": n}

    def path(self):
        nodes, rels = [self.node()], []
        while self.at("p", "-"):
            self.take("p", "-")
            self.take("p", "[")
            # a type written without its colon is read here and resolved by the store, which
            # knows the graph's types (§3, req:3.bare-link-type)
            bare = not self.at("p", ":")
            if not bare:
                self.take("p", ":")
            line = self.line()
            typ = self.name()
            props = self.props()
            self.take("p", "]")
            self.take("arrow")
            rels.append({"type": typ, "props": props, "bare": bare, "line": line})
            nodes.append(self.node())
        return nodes, rels

    def statement(self):
        matches, paths, sets = [], [], []
        while self.at("kw", "MATCH"):
            self.take("kw", "MATCH")
            matches.append(self.node())
            while self.at("p", ","):
                self.take("p", ",")
                matches.append(self.node())
        if not matches and self.at("p", "("):
            pass  # the data shortcut (§3): a block that only lists things and links means INSERT
        elif not self.at("kw", "SET"):
            # a SET alone names its nodes, by MATCH or by id (6 Oct 2026)
            self.take("kw", "INSERT")
        if not self.at("kw", "SET"):
            paths.append(self.path())
            while True:
                if self.at("p", ","):
                    self.take("p", ",")
                    paths.append(self.path())
                    continue
                # §3, 7 Oct 2026: a complete pattern starting on a later line, with no comma before
                # it, is read as if the comma were there
                prev = self.t[self.i - 1] if self.i else None
                if self.at("p", "(") and prev and self.line() > prev[2]:
                    at = self.i
                    try:
                        p = self.path()
                    except ProfileError:
                        self.i = at
                    else:
                        self.commas.append(prev[2])
                        paths.append(p)
                        continue
                break
        if self.at("kw", "SET"):
            self.take("kw", "SET")
            while True:
                n = self.line()
                var = self.name()
                self.take("p", ".")
                key = self.name()
                self.take("p", "=")
                sets.append((var, key, self.value(), n))
                if not self.at("p", ","):
                    break
                self.take("p", ",")
        if not self.at("end"):
            raise ProfileError(
                self.line(),
                f"unexpected {self.peek()[1]!r}",
                "a data block ends after its INSERT and SET (§3)",
            )
        return matches, paths, sets


def unquote(s):
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)), s[1:-1])


class Store:
    """Graphs built from data blocks, in the order they are applied — {graph: {'nodes': {key:
    {'labels', 'props'}}, 'edges': [...]}}."""

    def __init__(self):
        self.graphs = {}
        self._k = 0
        self.schemas = {}
        self.named = {}
        # schema name -> its graph; data graph -> the schema its header names; commas: [{graph,
        # line}] where a missing comma was read in (§3)
        self.commas = []
        # bares: [{graph, line, written, type}] where a type written without its colon was read as
        # the graph's one type of that name, ignoring case (§3); _fixes: the same, by block text
        self.bares = []
        self._fixes = {}

    def graph(self, g):
        return self.graphs.setdefault(g, {"nodes": {}, "edges": []})

    def find(self, g, nid):
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
            )
        if len(found) > 1:
            raise ProfileError(
                r["line"],
                f"[{written}] has no colon, and graph {g} has relationship types "
                f"{', '.join(found[:-1])} and {found[-1]}, which differ only by case",
                f"write the one meant with its colon, such as [:{found[0]}]",
            )
        self.bares.append({"graph": g, "line": r["line"], "written": written, "type": found[0]})
        self._fixes.setdefault(block, []).append((r["line"], written, found[0]))
        return found[0]

    def corrected(self, block):
        """The block with each bare type this store read written with its colon, as its graph
        spells it — the text an engine may be given (req:3.engine-gets-corrected)."""
        lines = block.split("\n")
        for line, written, typ in self._fixes.get(block, []):
            lines[line - 1] = re.sub(
                r"\[(\s*)" + re.escape(written) + r"\b",
                lambda m: f"[{m.group(1)}:{typ}",
                lines[line - 1],
                count=1,
            )
        return "\n".join(lines)

    def apply(self, block):
        g, kind = header(block)
        if kind == "query":
            raise ProfileError(
                1, "this is a query block", "queries ask questions of a graph; they are not data"
            )
        if kind == "excerpt":
            raise ProfileError(
                1, "this is an excerpt", "an excerpt illustrates part of a graph; it is not data"
            )
        first = next((line for line in block.splitlines() if line.strip()), "")
        if kind == "schema":  # a shared schema (§5): kept apart from the data, under its own name
            name = re.search(r"·\s*SCHEMA\s+(\S+)", first).group(1)
            g = "schema " + name
            self.schemas[name] = g
            self.graphs.pop(g, None)
        else:
            m = re.search(r"·\s*schema\s+(\S+)", first)
            if m:
                self.named[g] = m.group(1)
        toks = tokens(block)
        if not toks:
            return g
        parser = Parser(toks)
        matches, paths, sets = parser.statement()
        self.commas.extend({"graph": g, "line": n} for n in parser.commas)
        graph = self.graph(g)
        bound = {}
        for m in matches:
            if set(m["props"]) != {"id"}:
                raise ProfileError(
                    m["line"],
                    "MATCH must find a node by its id alone",
                    "write MATCH (v:Label {id: '…'})",
                )
            k = self.find(g, m["props"]["id"])
            if k is None or not set(m["labels"]) <= graph["nodes"][k]["labels"]:
                raise ProfileError(
                    m["line"],
                    f"MATCH finds no {':'.join(m['labels'])} with id {m['props']['id']!r} "
                    f"in graph {g}",
                    "the node must be written earlier — in this document or one loaded before it",
                )
            bound[m["var"]] = k
        # left to right, as Grafeo binds them: a name is reused only once its node is written —
        # earlier in the block, earlier in this path, or found by MATCH (§3)
        for nodes, rels in paths:
            for n in nodes:
                if n["labels"] or n["props"]:
                    if n["var"] in bound:
                        raise ProfileError(
                            n["line"],
                            f"{n['var']} is written twice",
                            "give each new node its own variable",
                        )
                    if "id" not in n["props"]:
                        # a thing's name is its id (§3, 6 Oct 2026)
                        n["props"] = {"id": n["var"], **n["props"]}
                    if self.find(g, n["props"]["id"]) is not None:
                        raise ProfileError(
                            n["line"],
                            f"id {n['props']['id']!r} is already a node in graph {g}",
                            "an id names one node (§10) — MATCH it to add to it, "
                            "or supersede it (§12)",
                        )
                    self._k += 1
                    k = f"n{self._k}"
                    graph["nodes"][k] = {"labels": set(n["labels"]), "props": dict(n["props"])}
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
                            "write the node before any relationship that uses it — "
                            "GQL binds a name only once its node is written (§3)",
                        )
                    # a bare name not written in this block names the existing node with that
                    # id (§3)
                    k = self.find(g, n["var"])
                    if k is None:
                        raise ProfileError(
                            n["line"],
                            f"no thing called {n['var']} in graph {g}",
                            "check the spelling — or write it here with its kind: "
                            f"({n['var']}:Kind {{…}})",
                        )
                    bound[n["var"]] = k
            for a, r, b in zip(nodes, rels, nodes[1:]):
                typ = self._resolve(g, r, block) if r.get("bare") else r["type"]
                graph["edges"].append((bound[a["var"]], typ, bound[b["var"]], dict(r["props"])))
        for var, key, val, n in sets:
            if var not in bound and self.find(g, var) is not None:
                bound[var] = self.find(g, var)  # SET name.key names the node with that id (§3)
            if var not in bound:
                raise ProfileError(
                    n,
                    f"SET names {var}, which is no thing in graph {g}",
                    "check the spelling — SET names a thing by its id",
                )
            graph["nodes"][bound[var]]["props"][key] = val
        return g


def _norm(p):
    return {
        k: (
            v.replace(tzinfo=UTC).isoformat()
            if isinstance(v, dt.datetime)
            else v.isoformat()
            if isinstance(v, dt.date)
            else v
        )
        for k, v in (p or {}).items()
        if v is not None
    }


def canon(store, g):
    """The same canonical hash as graph_spec.canon_graph — so the reader can be proved equal to
    Grafeo."""
    graph = store.graph(g)
    byk = {k: n["props"]["id"] for k, n in graph["nodes"].items()}
    from graph_rules import jcs

    body = sorted(
        [[sorted(n["labels"]), _norm(n["props"])] for n in graph["nodes"].values()],
        key=lambda x: x[1]["id"],
    ) + sorted([[byk[s], t, byk[d], _norm(p)] for s, t, d, p in graph["edges"]], key=jcs)
    return hashlib.sha256(jcs(body).encode()).hexdigest(), len(graph["nodes"]), len(graph["edges"])


def check_syntax(block):
    """A data block's shape against the profile, without applying it — None, or the ProfileError.
    Query blocks are not data and pass."""
    try:
        g, kind = header(block)
        if kind in ("query", "excerpt"):
            return None
        toks = tokens(block)
        if toks:
            bind_order(*Parser(toks).statement()[:2])
    except ProfileError as e:
        return e
    return None


def bind_order(matches, paths):
    """§3: a name is reused only once its node is written — by MATCH, earlier in the block, or
    earlier in its path. Grafeo refuses anything else."""
    bound = {m["var"] for m in matches}
    written = {n["var"] for ns, _ in paths for n in ns if n["labels"] or n["props"]}
    for nodes, _ in paths:
        for n in nodes:
            if n["labels"] or n["props"]:
                bound.add(n["var"])
            elif n["var"] not in bound and n["var"] in written:
                raise ProfileError(
                    n["line"],
                    f"{n['var']} is used before it is written",
                    "write the node before any relationship that uses it — "
                    "GQL binds a name only once its node is written (§3)",
                )
