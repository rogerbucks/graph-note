"""What a host sets after importing graph_spec: how documents are read, who a joined graph names,
and the classification note. The defaults name no machine or person.

graph_spec forwards an assignment such as graph_spec.CLASSIFICATION_NOTE = path to this module,
and the code reads each setting from here when it runs, so a setting made after import is seen.
"""

from __future__ import annotations

# how parse() reads a document's graph: 'profile', the portable reader (gql_profile), unless the
# host asks for the engine with 'grafeo' (req:3.reader-default)
PARSER = "profile"

NOTICES = []  # things a reader should know that are not failures — read and cleared by the runner

# Set by the host after import: the engine and the author a joined graph's GraphMeta names. The
# defaults name no machine or person.
OWNER_ENGINE, WRITTEN_BY = "engine:local", "graph-spec"

# Set by the host after import: the note that holds the destination matrix and the ranked classes
# (§24 H3, the view server). Nothing is read until it is.
CLASSIFICATION_NOTE = None
MATRIX_ROWS = {"cloud": "Claude — conversation", "local": "Local model"}

# every setting above, by name — what graph_spec forwards here
NAMES = (
    "PARSER",
    "NOTICES",
    "OWNER_ENGINE",
    "WRITTEN_BY",
    "CLASSIFICATION_NOTE",
    "MATRIX_ROWS",
)
