"""Parses a data block's tokens into its MATCHes, paths and SETs, as the document profile
(§3) writes them."""

from __future__ import annotations

import datetime as dt
import re

from graphspec.reader.lexer import ProfileError, UTC, unquote


class IdNotTextError(ProfileError):
    """A node's id written as a value that is not text (§3, req:3.id-is-text): the missing comma's
    retry keeps it, never taking it for a pattern that is not one."""


class Parser:
    """Reads one block's tokens, left to right, into its statement: MATCHes, paths and
    SETs (§3)."""

    def __init__(self, toks):
        # commas: (line, at) for each missing comma read in (§3) — the line it is missing from,
        # and where in the block the code on that line ends, which is where it is written in
        self.t, self.i, self.commas = toks, 0, []

    def peek(self, k=0):
        """The token k places ahead, or an `end` token on the last line once the tokens run out."""
        return (
            self.t[self.i + k]
            if self.i + k < len(self.t)
            else ("end", "", self.t[-1][2] if self.t else 1, "", self.t[-1][4] if self.t else 0)
        )

    def name(self):
        """A label, type, key or variable — a keyword in a name's place is a name (Grafeo 0.5.43
        accepts date, to and on as names)."""
        k, t, n, raw, _ = self.peek()
        if k in ("id", "kw"):
            self.i += 1
            return raw
        raise ProfileError(
            n,
            f"expected a name, found {t or 'the end'!r}",
            "keep to the document profile (§3)",
            code="GN202",
        )

    def line(self):
        """The line of the token being read."""
        return self.peek()[2]

    def take(self, kind=None, text=None):
        """Takes the next token, refused with the profile's error unless it is of this kind and
        text."""
        tok = self.peek()
        if (kind and tok[0] != kind) or (text and tok[1] != text):
            want = text or kind
            raise ProfileError(
                tok[2],
                f"expected {want!r}, found {tok[1] or 'the end'!r}",
                "keep to the document profile (§3)",
                code="GN201",
            )
        self.i += 1
        return tok

    def at(self, kind=None, text=None):
        """Whether the next token is of this kind and text, taking nothing."""
        tok = self.peek()
        return (not kind or tok[0] == kind) and (not text or tok[1] == text)

    def value(self):
        """A property value: text, a number, TRUE or FALSE, a DATE, or a DATETIME held
        as its UTC time (§3); no lists, no expressions."""
        k, t, n, _, _ = self.peek()
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
                raise ProfileError(
                    n, f"{s!r} is not a date", "write DATE 'YYYY-MM-DD'", code="GN203"
                )
        if k == "kw" and t == "DATETIME":
            self.i += 1
            s = unquote(self.take("str")[1])
            try:
                v = dt.datetime.fromisoformat(s)
            except ValueError:
                raise ProfileError(
                    n,
                    f"{s!r} is not an instant",
                    "write DATETIME 'YYYY-MM-DDTHH:MM:SS+HH:MM'",
                    code="GN204",
                )
            if v.tzinfo is None:
                raise ProfileError(
                    n,
                    f"{s!r} has no offset",
                    "an instant carries its offset (§9, principle 11)",
                    code="GN205",
                )
            # an instant as its UTC time, exactly as Grafeo returns it; one whose UTC time is
            # before year 1 or after 9999 cannot be held, and is refused as any unreadable value is
            try:
                return v.astimezone(UTC).replace(tzinfo=None)
            except OverflowError:
                raise ProfileError(
                    n,
                    f"{s!r} is not an instant: in UTC it falls outside years 1 to 9999",
                    "write DATETIME 'YYYY-MM-DDTHH:MM:SS+HH:MM' within years 1 to 9999",
                    code="GN206",
                )
        raise ProfileError(
            n,
            f"{t or 'nothing'!r} is not a value in the profile",
            "use 'text', a number, TRUE, FALSE, DATE '…' or DATETIME '…' — "
            "no lists, no expressions",
            code="GN207",
        )

    def text_id(self):
        """Refuses a node's id written as a value that is not text — a number, TRUE, FALSE, DATE
        '…' or DATETIME '…' — with the fix that quotes it (§3, req:3.id-is-text)."""
        k, t, n, raw, _ = self.peek()
        if k == "num" or (k == "kw" and t in ("TRUE", "FALSE")):
            written, quoted = raw, f"'{raw}'"
        elif k == "kw" and t in ("DATE", "DATETIME") and self.peek(1)[0] == "str":
            written, quoted = f"{raw} {self.peek(1)[1]}", self.peek(1)[1]
        else:
            return
        raise IdNotTextError(
            n,
            f"id {written} is not text",
            f"write id: {quoted} — a node's id is always text (§3)",
            code="GN208",
        )

    def props(self, node=False):
        """A `{key: value, ...}` map, or an empty one when there is none; a node's id
        must be text."""
        out = {}
        if not self.at("p", "{"):
            return out
        self.take("p", "{")
        while not self.at("p", "}"):
            key = self.name()
            self.take("p", ":")
            if node and key == "id":
                self.text_id()
            out[key] = self.value()
            if not self.at("p", "}"):
                self.take("p", ",")
        self.take("p", "}")
        return out

    def node(self):
        """A node pattern: `(var:Label {props})`."""
        n = self.take("p", "(")[2]
        var = self.name()
        labels = []
        while self.at("p", ":"):
            self.take("p", ":")
            labels.append(self.name())
        props = self.props(node=True)
        self.take("p", ")")
        return {"var": var, "labels": labels, "props": props, "line": n}

    def path(self):
        """A path: nodes joined by `-[:TYPE {props}]->` links."""
        nodes, rels = [self.node()], []
        while self.at("p", "-"):
            self.take("p", "-")
            self.take("p", "[")
            # a type written without its colon is read here and resolved by the store, which
            # knows the graph's types (§3, req:3.bare-link-type)
            bare = not self.at("p", ":")
            if not bare:
                self.take("p", ":")
            _, _, line, raw, end = self.peek()
            typ = self.name()
            props = self.props()
            self.take("p", "]")
            self.take("arrow")
            # at: where the type begins in the block, where a bare one's colon is written in
            rels.append(
                {"type": typ, "props": props, "bare": bare, "line": line, "at": end - len(raw)}
            )
            nodes.append(self.node())
        return nodes, rels

    def statement(self):
        """The block's whole statement: its MATCHes, its INSERTed paths and its SETs."""
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
                    except IdNotTextError:
                        raise  # its id refused, never hidden as "unexpected '('" (review of #49)
                    except ProfileError:
                        self.i = at
                    else:
                        # the token before ends its line's code: a comment after code is refused
                        self.commas.append((prev[2], prev[4]))
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
                if key == "id":
                    # §3, req:3.set-keeps-id: whatever the value — a used id, a fresh one, or
                    # the node's own
                    raise ProfileError(
                        n,
                        f"SET would change {var}'s id, and a node's id never changes (§3)",
                        f"write the right node, then link {var} to it or supersede it (§12)",
                        code="GN209",
                    )
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
                code="GN210",
            )
        return matches, paths, sets
