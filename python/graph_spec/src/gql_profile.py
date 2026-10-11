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
owned_comments(block) reads the /// notes and //@ lines each element owns (§26, §27).
Blocks marked '// graph: G · QUERY' are queries, not data, and are refused here.

The reader lives in graphspec/reader/ (GUIDE.md); this module is its entry point and
re-exports every name it has always had, from where it lives now.
"""

# An entry point: it imports every name to re-export it, so none is unused.
# ruff: noqa: F401

import copy
import datetime as dt
import hashlib
import re

from graphspec.reader.lexer import (
    COMMENT_FIX,
    COMMENT_RULE,
    KEYWORDS,
    ProfileError,
    TOKEN,
    UTC,
    header,
    tokens,
    unquote,
)
from graphspec.reader.grammar import (
    Parser,
)
from graphspec.reader.to_gql import (
    _bare,
    _bare_names,
    _gql_value,
    to_gql,
)
from graphspec.reader.store import (
    Store,
)
from graphspec.reader.drawing import (
    _dangling_comma,
    _data_kind,
    _first_line,
    _graph_of,
    _items,
    _line_at,
    _line_end_comments,
    _u16,
    _without,
    read_for_drawing,
    style_of,
)
from graphspec.style.reading import (
    read_style,
)
from graphspec.reader.name_suggestions import (
    name_from_text,
    name_style_of,
    name_words,
)
from graphspec.reader.name_gaps import (
    suggested_names,
)
from graphspec.reader.canonical_hash import (
    _norm,
    canon,
)
from graphspec.reader.owned_comments import (
    owned_comments,
)
from graphspec.reader.syntax_check import (
    bind_order,
    check_syntax,
)
