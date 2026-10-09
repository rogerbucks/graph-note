"""Parses a data block's tokens into its MATCHes, paths and SETs, as the document profile
(§3) writes them."""

from __future__ import annotations

import datetime as dt
import re

from graphspec.reader.lexer import ProfileError, UTC, unquote


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
