#!/usr/bin/env python3
"""Implements the graph spec's checkable rules — reading, joining (§21), projection (§18), process
engine (§7, §16), certainty (§20), paths (§22) and judgements (§23), the dialect linter and the
hash filler (§24 H1, H2) — for the conformance suite.

Usage (imported by the conformance suite):
  python -c "import sys; sys.path.insert(0, 'python/graph_spec/src'); import graph_spec"

Writes: nothing (library).

The one implementation the spec's tests run against; the cases and their expected answers are data
in the test documents (spec §17), not code here. It reads and checks with the reader by default
(req:3.reader-default): a plain install needs no engine (req:14.no-engine-install). Grafeo 0.5.43,
the dialect the spec names (§3), is the optional extra graph-spec[grafeo], for database work and
for a host that sets PARSER = 'grafeo'; PyYAML is pinned in python/graph_spec.
A host sets CLASSIFICATION_NOTE, OWNER_ENGINE and WRITTEN_BY after import (see
graphspec/engine/settings.py); the defaults name no machine or person.

DIALECT — Grafeo 0.5.43, pinned; the full list is E10 of the Graph spec model:
  reserved words include on, to, for, date, groups, Group · ZONED DATETIME comparisons return null
  (store DATETIME with an offset) · an aggregate mixed with a plain value in one expression returns
  null (aggregate first with WITH) · uncorrelated CALL · no byte literals · CREATE GRAPH TYPE not
  enforced · a pattern returning to a bound variable does not enforce it (match twice and compare
  ids) · SET must follow INSERT in one statement · a list literal drops its null elements (return a
  map).

The code lives in graphspec/engine/ (GUIDE.md); this module is its entry point and
re-exports every name it has always had, from where it lives now. A setting assigned here
(graph_spec.PARSER, OWNER_ENGINE, WRITTEN_BY, CLASSIFICATION_NOTE, MATRIX_ROWS, NOTICES) is
forwarded to graphspec/engine/settings.py, where the code reads it when it runs.
"""

# An entry point: it imports every name to re-export it, so none is unused.
# ruff: noqa: F401

import base64
import datetime as dt
import gql_profile as _gp
import hashlib
import json
import math
import os
import re
import sys as _sys
import types as _types
from collections import Counter
from collections import deque
from itertools import combinations

from graphspec.engine import settings as _settings
from graphspec.engine.optional_imports import (
    _Lazy,
    etree,
    grafeo,
    rfc8785,
    yaml,
)
from graphspec.engine.settings import (
    CLASSIFICATION_NOTE,
    MATRIX_ROWS,
    NOTICES,
    OWNER_ENGINE,
    PARSER,
    WRITTEN_BY,
)
from graphspec.engine.queries import (
    Q,
    Q_,
    UTC,
    _query_rows,
    canon_graph,
    load,
    read,
    strip,
)
from graphspec.engine.projection import (
    PROJECTION_TZ,
    canon,
    iso,
    project,
    projects_back,
    rebuild,
)
from graphspec.engine.schema import (
    _declared,
    typed,
    untyped,
)
from graphspec.engine.process.machine import (
    Machine,
)
from graphspec.engine.process.scxml import (
    NS,
    ScxmlReader,
    ecma,
    equivalent,
    process_events,
    scxml_valid,
    to_scxml,
)
from graphspec.engine.joining.config import (
    ABSENT,
    META,
    config,
    config_from,
)
from graphspec.engine.documents.reading import (
    QUOTES,
    gql_block,
    parse,
    require_graph_line,
)
from graphspec.engine.joining.restating import (
    compatible,
    doc_statements,
    ekey,
    normalise,
    raw_props,
    refines,
    statements,
)
from graphspec.engine.joining.breaches import (
    breaches,
    cycles,
    guard_holds,
    validate,
)
from graphspec.engine.joining.claims import (
    add_claim,
    ident_str,
    new_J,
    short,
    vtext,
)
from graphspec.engine.joining.union import (
    union,
)
from graphspec.engine.joining.merge3 import (
    merge3,
)
from graphspec.engine.joining.finish import (
    finish,
    join,
    join3,
)
from graphspec.engine.joining.audit import (
    held,
    invented,
    lost,
)
from graphspec.engine.joining.emit import (
    emit,
)
from graphspec.engine.joining.named_rules import (
    FIGURES,
    RULES,
    _else_over,
    ancestors,
    fig_loan_balance,
    flow_parents,
    nesting_loop,
    rule_else_over_ancestor,
    rule_else_over_parent,
    rule_final_is_final,
    rule_one_start,
    rule_repaid_after_drawn,
    rule_subflow_needs_done,
    rule_subflow_nesting_acyclic,
)
from graphspec.engine.joining.gql_rules import (
    gql_rule,
    structs_to_db,
)
from graphspec.engine.certainty.scale import (
    CONFIDENCE,
    LIKELIHOOD,
    RANGE,
    _BANDS,
    _word_hi,
    _word_lo,
    band_rank,
    both,
    corroborate,
    either,
    negate,
    outcomes,
    span,
    verdict,
    wilson,
    words,
)
from graphspec.engine.certainty.caches import (
    certainty_lens,
    claim_status,
    confidence_from_evidence,
    derived_ranges,
    latest_assessment,
    settled,
)
from graphspec.engine.certainty.track_record import (
    calibrated_marker,
    calibration,
    corroboration,
    reliability,
    sources_of,
)
from graphspec.engine.certainty.checks import (
    section20,
)
from graphspec.engine.paths import (
    lift,
    path_steps,
    paths_rules,
    view_at,
)
from graphspec.engine.judgements.basis import (
    JUDGEMENT_EDGES,
    _norm,
    basis,
    basis_hash,
    current_decisions,
    hash16,
    judgement_hash,
    lens_bucket,
    resolve_ref,
)
from graphspec.engine.judgements.review import (
    review,
    why_layer,
)
from graphspec.engine.judgements.checks import (
    judgements_rules,
)
from graphspec.engine.dialect_lint import (
    AGGREGATES,
    RESERVED_ANYWHERE,
    SILENT_TRAPS,
    _blank,
    _close,
    lint,
)
from graphspec.engine.documents.fill import (
    FILL_BLOCK,
    _block_of,
    compute,
    fill,
    fill_check,
    fill_recipes,
    ni_uri,
    unfill,
)
from graphspec.engine.documents.classification import (
    _classification_note,
    class_order,
    destination_matrix,
    document_class,
    may_serve,
)
from graphspec.engine.serving.view_server import (
    ViewServer,
)
from graphspec.engine.serving.checks import (
    fence_holds,
    served_rules,
)
from graphspec.engine.changesets import (
    _state,
    changeset_header,
    check_changeset,
    graph_rules,
    refresh_section20,
)
from graphspec.engine.embedded_queries import (
    EMBEDDED,
    embedded_queries,
)


# A setting a host assigns here — graph_spec.CLASSIFICATION_NOTE = path — must reach the code that
# reads it, which reads it from graphspec.engine.settings when it runs; so each setting is a
# property of this module that reads and writes there.


class _Settings(_types.ModuleType):
    """graph_spec, with each setting read from and assigned to graphspec.engine.settings."""


def _setting(name):
    def get(module):
        return getattr(_settings, name)

    def put(module, value):
        setattr(_settings, name, value)
        module.__dict__[name] = value

    return property(get, put)


for _name in _settings.NAMES:
    setattr(_Settings, _name, _setting(_name))
del _name
_sys.modules[__name__].__class__ = _Settings
