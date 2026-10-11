"""Every view returns the same things in Grafeo as in the core (editor spec §7:
views_agree_with_grafeo, five_view_kinds; §2 views_in_the_note).

One table, tests/view_cases.json, holds small notes with views of each of the five kinds written in
them as named query blocks, and what each view returns. The core's
packages/core/test/view-parity.test.js holds the core to the table; this holds Grafeo, the
reference engine, to it, running each view's query as it is written. Together they prove that the
two return the same things.

Each note's data blocks go to Grafeo as every route to the engine sends them: read by the reader
first, a block it refuses never given (req:3.engine-reads-first), and the rest as the reader's
corrected text, so a thing's name is its id. Each view's query goes as written, with only its
whole-line comments and escapes put in forms Grafeo reads, as a block's are. Grafeo answers with
things, and for how one thing reaches another with the routes' links too; a walked path's rows are
its steps, a thing once for every time the walk reaches it.

A view never names a thing or a route by a word GQL keeps for itself, or one Grafeo refuses as a
name, nor asks for a kind Grafeo refuses as a label: the core refuses such a view
(packages/core/src/reserved-words.ts). Here Grafeo is asked a fixed list of words, never taken
from the lists it tests (GQL's, Cypher's, and the numbers NaN and Inf), in every place a view
names something and every way it asks for a kind, and what it refuses must be exactly the core's
lists, so a view the core reads never has a name or a kind Grafeo refuses.

Grafeo is a test dependency only: without it (CI's python-no-engine job) the comparisons are
skipped, and the table's own checks still run.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_view_parity
"""

import json
import os
import re
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_spec as gs  # noqa: E402
from engine_support import needs_engine  # noqa: E402
from graphspec.engine.queries import _block_comment, for_grafeo  # noqa: E402
from graphspec.reader.whitespace import strip  # noqa: E402

with open(os.path.join(HERE, "view_cases.json"), encoding="utf-8") as f:
    TABLE = json.load(f)

KINDS = ("picked", "near", "reaches", "kinds", "path")


def text(lines):
    return "\n".join(lines)


def graph_of(block):
    return re.match(r"\s*// graph: (\w+)", block).group(1)


def views():
    """Every view of the table, with the note it is written in."""
    return [(note, view) for note in TABLE["notes"] for view in note["views"]]


def name_of(view):
    return re.search(r"QUERY view (\w+)$", view["block"][0]).group(1)


def query_of(view):
    """A view's query: what follows its graph line, as the core's viewsOf takes it."""
    return text(view["block"][1:])


def for_engine(query):
    """The query as Grafeo reads it: a whole-line // comment as a /* */ comment
    (req:3.engine-keeps-comments) and each quoted text's escapes in forms Grafeo reads
    (req:3.gql-escapes), as every route to the engine gives a block's; nothing else changed."""
    return "\n".join(
        _block_comment(line) if strip(line).startswith("//") else for_grafeo(line)
        for line in query.split("\n")
    )


def refused_blocks(note):
    """The blocks of a note the reader refuses, read in order into one store."""
    st, out = gp.Store(), []
    for i, lines in enumerate(note["blocks"]):
        try:
            st.apply(text(lines))
        except gp.ProfileError:
            out.append(i)
    return out


def in_grafeo(note):
    """A note's data blocks in one Grafeo database: each read by the reader first, a block it
    refuses never given, the rest given as its corrected text, in the graph its header names."""
    db, st, made = gs.grafeo.GrafeoDB(), gp.Store(), set()
    for lines in note["blocks"]:
        block = text(lines)
        try:
            st.apply(block)
        except gp.ProfileError:
            continue
        g = graph_of(block)
        if g not in made:
            db.execute(f"CREATE GRAPH {g}")
            made.add(g)
        db.set_graph(g)
        db.execute(gs.strip(st.corrected(block)))
    return db


def grafeos_answer(db, graph, query):
    """What Grafeo returns for a view's query: the things (ids, sorted), the links of every route
    returned ('from TYPE to', sorted), and the things in the last column, one for each row that
    has one there (sorted)."""
    db.set_graph(graph)
    ids = {r["k"]: r["i"] for r in db.execute("MATCH (n) RETURN id(n) AS k, n.id AS i")}
    links = {
        r["e"]: f"{r['s']} {r['t']} {r['d']}"
        for r in db.execute(
            "MATCH (a)-[r]->(b) RETURN id(r) AS e, a.id AS s, type(r) AS t, b.id AS d"
        )
    }
    result = db.execute(for_engine(query))
    columns, rows = list(result.columns), list(result)
    things, routes = set(), set()
    for row in rows:
        for value in row.values():
            if "_id" in value:
                things.add(value["id"])
            else:  # a route: the things and links it goes through
                things |= {ids[k] for k in value["nodes"]}
                routes |= {links[e] for e in value["edges"]}
    last = sorted(row[columns[-1]]["id"] for row in rows if "_id" in row[columns[-1]])
    return sorted(things), sorted(routes), last


def core_words():
    """The core's word lists (packages/core/src/reserved-words.ts), read through Node: the words
    GQL keeps (reserved, pre-reserved, values), those it leaves free, and the words Grafeo refuses
    as a name and as a kind."""
    script = (
        "import(process.argv[1]).then(m => process.stdout.write(JSON.stringify({"
        "kept: [...m.GQL_RESERVED, ...m.GQL_PRE_RESERVED, ...m.GQL_VALUES],"
        "free: m.GQL_NON_RESERVED, grafeo: m.GRAFEO_REFUSED, kinds: m.GRAFEO_REFUSED_KINDS})))"
    )
    url = "file://" + os.path.join(ROOT, "packages", "core", "src", "reserved-words.ts")
    out = subprocess.run(["node", "-e", script, url], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# every place a view names a thing or a route, each shape as the core reads it, on the walks note
NAMED = (
    "MATCH ({w}) WHERE {w}.id IN ['home'] RETURN {w}",
    "MATCH ({w} {{id: 'home'}})-[]-{{1,1}}(m) RETURN {w}, m",
    "MATCH (n {{id: 'home'}})-[]-{{1,1}}({w}) RETURN n, {w}",
    "MATCH {w} = (a {{id: 'home'}})-[]->{{1,1}}(b {{id: 'shop'}}) RETURN {w}",
    "MATCH p = ({w} {{id: 'home'}})-[]->{{1,1}}(b {{id: 'shop'}}) RETURN p",
    "MATCH p = (a {{id: 'home'}})-[]->{{1,1}}({w} {{id: 'shop'}}) RETURN p",
    "MATCH ({w} IS Place) RETURN {w}",
    "MATCH ({w}:Path {{id: 'tour'}})-[:STEP]->(n) RETURN {w}, n",
    "MATCH (p:Path {{id: 'tour'}})-[:STEP]->({w}) RETURN p, {w}",
)


# every way a view asks for a kind: after a colon, and first or later in a choice after IS
KINDED = (
    "MATCH (n:{w}) RETURN n",
    "MATCH (n IS {w}|Place) RETURN n",
    "MATCH (n IS Place|{w}) RETURN n",
)

# The words Grafeo is asked, fixed here and never taken from the lists they test: GQL's reserved,
# pre-reserved and non-reserved words (ISO/IEC 39075:2024 §21.3, as the openGQL grammar GQL.g4
# lists them) and its truth values (§21.2), Cypher's keywords (Neo4j's, with the older ones), and
# the numbers Grafeo reads as words.
GQL_KEPT = """ABS ACOS ALL ALL_DIFFERENT AND ANY ARRAY AS ASC ASCENDING ASIN AT ATAN AVG BIG
BIGINT BINARY BOOL BOOLEAN BOTH BTRIM BY BYTE_LENGTH BYTES CALL CARDINALITY CASE CAST CEIL
CEILING CHAR CHAR_LENGTH CHARACTER_LENGTH CHARACTERISTICS CLOSE COALESCE COLLECT_LIST COMMIT
COPY COS COSH COT COUNT CREATE CURRENT_DATE CURRENT_GRAPH CURRENT_PROPERTY_GRAPH
CURRENT_SCHEMA CURRENT_TIME CURRENT_TIMESTAMP DATE DATETIME DAY DEC DECIMAL DEGREES DELETE
DESC DESCENDING DETACH DISTINCT DOUBLE DROP DURATION DURATION_BETWEEN ELEMENT_ID ELSE END
EXCEPT EXISTS EXP FILTER FINISH FLOAT FLOAT16 FLOAT32 FLOAT64 FLOAT128 FLOAT256 FLOOR FOR
FROM GROUP HAVING HOME_GRAPH HOME_PROPERTY_GRAPH HOME_SCHEMA HOUR IF IN INSERT INT INTEGER
INT8 INTEGER8 INT16 INTEGER16 INT32 INTEGER32 INT64 INTEGER64 INT128 INTEGER128 INT256
INTEGER256 INTERSECT INTERVAL IS LEADING LEFT LET LIKE LIMIT LIST LN LOCAL LOCAL_DATETIME
LOCAL_TIME LOCAL_TIMESTAMP LOG LOG10 LOWER LTRIM MATCH MAX MIN MINUTE MOD MONTH NEXT
NODETACH NORMALIZE NOT NOTHING NULL NULLS NULLIF OCTET_LENGTH OF OFFSET OPTIONAL OR ORDER
OTHERWISE PARAMETER PARAMETERS PATH PATH_LENGTH PATHS PERCENTILE_CONT PERCENTILE_DISC POWER
PRECISION PROPERTY_EXISTS RADIANS REAL RECORD REMOVE REPLACE RESET RETURN RIGHT ROLLBACK
RTRIM SAME SCHEMA SECOND SELECT SESSION SESSION_USER SET SIGNED SIN SINH SIZE SKIP SMALL
SMALLINT SQRT START STDDEV_POP STDDEV_SAMP STRING SUM TAN TANH THEN TIME TIMESTAMP TRAILING
TRIM TYPED UBIGINT UINT UINT8 UINT16 UINT32 UINT64 UINT128 UINT256 UNION UNSIGNED UPPER USE
USMALLINT VALUE VARBINARY VARCHAR VARIABLE WHEN WHERE WITH XOR YEAR YIELD ZONED
ZONED_DATETIME ZONED_TIME
ABSTRACT AGGREGATE AGGREGATES ALTER CATALOG CLEAR CLONE CONSTRAINT CURRENT_ROLE CURRENT_USER
DATA DIRECTORY DRYRUN EXACT EXISTING FUNCTION GQLSTATUS GRANT INSTANT INFINITY NUMBER
NUMERIC ON OPEN PARTITION PROCEDURE PRODUCT PROJECT QUERY RECORDS REFERENCE RENAME REVOKE
SUBSTRING SYSTEM_USER TEMPORAL UNIQUE UNIT VALUES
FALSE TRUE UNKNOWN""".split()
GQL_FREE = """ACYCLIC BINDING BINDINGS CONNECTING DESTINATION DIFFERENT DIRECTED EDGE EDGES
ELEMENT ELEMENTS FIRST GRAPH GROUPS KEEP LABEL LABELED LABELS LAST NFC NFD NFKC NFKD NO NODE
NORMALIZED ONLY ORDINALITY PROPERTY READ RELATIONSHIP RELATIONSHIPS REPEATABLE SHORTEST
SIMPLE SOURCE TABLE TO TRAIL TRANSACTION TYPE UNDIRECTED VERTEX WALK WITHOUT WRITE
ZONE""".split()
CYPHER = """ACCESS ACTIVE ADMIN ADMINISTRATOR ALIAS ALIASES ALL_SHORTEST_PATHS ALLSHORTESTPATHS
ASSERT ASSIGN AUTH BOOSTED BREAK BRIEF BTREE BUILT CASCADE CHANGE CIDR COLLECT COMMAND
COMMANDS COMPOSITE CONCURRENT CONSTRAINTS CONTAINS CONTINUE CSV CURRENT CYPHER DATABASE
DATABASES DBMS DEALLOCATE DEFAULT DEFINED DENY DESTROY DRIVER DUMP EACH ENABLE ENCRYPTED
ENDS ERROR EXECUTABLE EXECUTE EXIST EXISTENCE EXPLAIN FAIL FIELDTERMINATOR FOREACH FULLTEXT
FUNCTIONS GRAPHS HEADERS HOME ID IMMUTABLE IMPERSONATE INDEX INDEXES JOIN KEY LOAD LOOKUP
MANAGEMENT MAP MERGE NAME NAMES NEW NODES NONE NOWAIT OPTION OPTIONS OUTPUT PASSWORD
PASSWORDS PERIODIC PLAINTEXT POINT POPULATED PRIMARIES PRIMARY PRIVILEGE PRIVILEGES
PROCEDURES PROFILE PROPERTIES PROVIDER PROVIDERS RANGE REALLOCATE REDUCE REL REPORT REQUIRE
REQUIRED RESTRICT ROLE ROLES ROW ROWS SCAN SEC SECONDARIES SECONDARY SECONDS SEEK SERVER
SERVERS SETTING SETTINGS SHORTEST_PATH SHORTESTPATH SHOW SINGLE STARTS STATUS STOP SUPPORTED
SUSPENDED TARGET TERMINATE TEXT TIMEZONE TOPOLOGY TRANSACTIONS TRAVERSE TYPES UNIQUENESS
UNWIND URL USER USERS USING VECTOR WAIT""".split()
NUMBERS = ["NAN", "INF"]
CANDIDATES = list(dict.fromkeys(GQL_KEPT + GQL_FREE + CYPHER + NUMBERS))


def refused_in(db, word, shapes):
    """Whether Grafeo refuses the word, in any case, in any of these shapes of view."""
    db.set_graph("walks")
    for written in (word.lower(), word, word.capitalize()):
        for shape in shapes:
            try:
                list(db.execute(shape.format(w=written)))
            # any error, never narrowed: Grafeo says a refusal only as a GrafeoError's text
            except Exception:
                return True
    return False


class ViewTable(unittest.TestCase):
    """The table itself, which needs no engine."""

    def test_the_table_has_every_kind_returning_things_and_returning_nothing(self):
        seen = {k: set() for k in KINDS}
        for _, view in views():
            seen[view["spec"]["kind"]].add(bool(view["things"]))
        self.assertEqual(seen, {k: {True, False} for k in KINDS})

    def test_the_reader_refuses_the_blocks_the_core_leaves_out(self):
        for note in TABLE["notes"]:
            self.assertEqual(refused_blocks(note), note.get("left_out", []), note["name"])

    def test_the_core_lists_gqls_words_as_the_standard_does(self):
        words = core_words()
        self.assertEqual(sorted(words["kept"]), sorted(GQL_KEPT))
        self.assertEqual(sorted(words["free"]), sorted(GQL_FREE))


@needs_engine
class GrafeoAgrees(unittest.TestCase):
    """Grafeo, running each view's query, returns what the table says the core returns."""

    @classmethod
    def setUpClass(cls):
        cls.dbs = {note["name"]: in_grafeo(note) for note in TABLE["notes"]}

    def answer(self, note, view):
        return grafeos_answer(self.dbs[note["name"]], note["graph"], query_of(view))

    # a plain loop in each test, never subTest: the tests-first replay counts a test by its result

    def test_grafeo_returns_the_things_each_view_returns(self):
        for note, view in views():
            things, _, _ = self.answer(note, view)
            self.assertEqual(things, view["things"], name_of(view))

    def test_grafeo_finds_the_links_of_each_route(self):
        compared = 0
        for note, view in views():
            if view["spec"]["kind"] != "reaches":
                continue
            _, routes, _ = self.answer(note, view)
            self.assertEqual(routes, sorted(view["links"]), name_of(view))
            compared += bool(routes)
        self.assertGreater(compared, 0, "no route has links, so none is compared")

    def test_grafeo_walks_each_path_through_its_steps(self):
        compared = 0
        for note, view in views():
            if view["spec"]["kind"] != "path":
                continue
            _, _, steps = self.answer(note, view)
            self.assertEqual(steps, sorted(view.get("walk", [])), name_of(view))
            compared += bool(steps)
        self.assertGreater(compared, 0, "no path has steps, so none is compared")

    def walks(self):
        return self.dbs[next(n for n in TABLE["notes"] if n["graph"] == "walks")["name"]]

    def test_grafeo_refuses_as_a_name_only_the_words_the_core_keeps_from_names(self):
        # of every word asked, those Grafeo refuses as a name beyond the ones GQL keeps are exactly
        # the core's list: no view the core reads has a name Grafeo refuses, and none is kept from
        # names for nothing
        refused = {w for w in CANDIDATES if refused_in(self.walks(), w, NAMED)}
        self.assertEqual(sorted(refused - set(GQL_KEPT)), core_words()["grafeo"])

    def test_grafeo_refuses_as_a_kind_exactly_the_words_the_core_refuses_as_kinds(self):
        # a kind is a label, which Grafeo refuses for fewer words than a name; of every word asked,
        # it refuses exactly the core's list, whichever way the kind is written
        refused = [w for w in CANDIDATES if refused_in(self.walks(), w, KINDED)]
        self.assertEqual(sorted(refused), core_words()["kinds"])


if __name__ == "__main__":
    unittest.main()
