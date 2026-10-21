// The words a view may not use as a name, and the kinds it may not ask for. See editor spec §7 (view_profile,
// views_agree_with_grafeo; engines_get_standard). A view is standard GQL that Grafeo runs as written. So a name in its
// pattern is never a word GQL keeps for itself, nor one Grafeo 0.5.43 refuses as a name. A kind it asks for is never
// one Grafeo refuses as a label. GQL's reserved, pre-reserved and non-reserved words are ISO/IEC 39075:2024 §21.3. Its
// truth values are §21.2, as the openGQL grammar (GQL.g4) gives them. Grafeo's two lists were found by running words in
// every place a view names something (11 Oct 2026). Each word was also run in every way a view asks for a kind. The
// words were GQL's words, Cypher's keywords and the numbers NaN and Inf. python/graph_spec/tests/test_view_parity.py
// holds both to Grafeo, from a word list of its own. What a person reads says only that GQL keeps the word: the refusal
// is the same whichever list holds it.
import { word } from './words.ts';

/** GQL's reserved words (ISO/IEC 39075:2024 §21.3), in the standard's order. */
export const GQL_RESERVED: readonly string[] = `ABS ACOS ALL ALL_DIFFERENT AND ANY ARRAY AS ASC ASCENDING ASIN AT ATAN
AVG BIG BIGINT BINARY BOOL BOOLEAN BOTH BTRIM BY BYTE_LENGTH BYTES CALL CARDINALITY CASE CAST CEIL CEILING CHAR
CHAR_LENGTH CHARACTER_LENGTH CHARACTERISTICS CLOSE COALESCE COLLECT_LIST COMMIT COPY COS COSH COT COUNT CREATE
CURRENT_DATE CURRENT_GRAPH CURRENT_PROPERTY_GRAPH CURRENT_SCHEMA CURRENT_TIME CURRENT_TIMESTAMP DATE DATETIME DAY DEC
DECIMAL DEGREES DELETE DESC DESCENDING DETACH DISTINCT DOUBLE DROP DURATION DURATION_BETWEEN ELEMENT_ID ELSE END EXCEPT
EXISTS EXP FILTER FINISH FLOAT FLOAT16 FLOAT32 FLOAT64 FLOAT128 FLOAT256 FLOOR FOR FROM GROUP HAVING HOME_GRAPH
HOME_PROPERTY_GRAPH HOME_SCHEMA HOUR IF IN INSERT INT INTEGER INT8 INTEGER8 INT16 INTEGER16 INT32 INTEGER32 INT64
INTEGER64 INT128 INTEGER128 INT256 INTEGER256 INTERSECT INTERVAL IS LEADING LEFT LET LIKE LIMIT LIST LN LOCAL
LOCAL_DATETIME LOCAL_TIME LOCAL_TIMESTAMP LOG LOG10 LOWER LTRIM MATCH MAX MIN MINUTE MOD MONTH NEXT NODETACH NORMALIZE
NOT NOTHING NULL NULLS NULLIF OCTET_LENGTH OF OFFSET OPTIONAL OR ORDER OTHERWISE PARAMETER PARAMETERS PATH PATH_LENGTH
PATHS PERCENTILE_CONT PERCENTILE_DISC POWER PRECISION PROPERTY_EXISTS RADIANS REAL RECORD REMOVE REPLACE RESET RETURN
RIGHT ROLLBACK RTRIM SAME SCHEMA SECOND SELECT SESSION SESSION_USER SET SIGNED SIN SINH SIZE SKIP SMALL SMALLINT SQRT
START STDDEV_POP STDDEV_SAMP STRING SUM TAN TANH THEN TIME TIMESTAMP TRAILING TRIM TYPED UBIGINT UINT UINT8 UINT16 UINT32
UINT64 UINT128 UINT256 UNION UNSIGNED UPPER USE USMALLINT VALUE VARBINARY VARCHAR VARIABLE WHEN WHERE WITH XOR YEAR
YIELD ZONED ZONED_DATETIME ZONED_TIME`.split(/\s+/);

/** GQL's pre-reserved words (§21.3): kept for later editions, so no name either. */
export const GQL_PRE_RESERVED: readonly string[] = `ABSTRACT AGGREGATE AGGREGATES ALTER CATALOG CLEAR CLONE CONSTRAINT
CURRENT_ROLE CURRENT_USER DATA DIRECTORY DRYRUN EXACT EXISTING FUNCTION GQLSTATUS GRANT INSTANT INFINITY NUMBER NUMERIC
ON OPEN PARTITION PROCEDURE PRODUCT PROJECT QUERY RECORDS REFERENCE RENAME REVOKE SUBSTRING SYSTEM_USER TEMPORAL UNIQUE
UNIT VALUES`.split(/\s+/);

/** The words GQL reads as values, never as names: its truth values, the <boolean literal> of §21.2. */
export const GQL_VALUES: readonly string[] = ['FALSE', 'TRUE', 'UNKNOWN'];

/** GQL's non-reserved words (§21.3): GQL lets them be names, but Grafeo refuses some, listed in `GRAFEO_REFUSED`. */
export const GQL_NON_RESERVED: readonly string[] = `ACYCLIC BINDING BINDINGS CONNECTING DESTINATION DIFFERENT DIRECTED
EDGE EDGES ELEMENT ELEMENTS FIRST GRAPH GROUPS KEEP LABEL LABELED LABELS LAST NFC NFD NFKC NFKD NO NODE NORMALIZED ONLY
ORDINALITY PROPERTY READ RELATIONSHIP RELATIONSHIPS REPEATABLE SHORTEST SIMPLE SOURCE TABLE TO TRAIL TRANSACTION TYPE
UNDIRECTED VERTEX WALK WITHOUT WRITE ZONE`.split(/\s+/);

/**
 * The words GQL leaves free that Grafeo 0.5.43 refuses as a name anywhere a view names something, in order: GQL's own
 * non-reserved ones, Cypher's, and NaN and Inf, which Grafeo reads as numbers.
 */
export const GRAFEO_REFUSED: readonly string[] = [
  'ACYCLIC',
  'CONTAINS',
  'DIFFERENT',
  'ENDS',
  'GROUPS',
  'INF',
  'MERGE',
  'NAN',
  'ORDINALITY',
  'REPEATABLE',
  'SHORTEST',
  'SIMPLE',
  'STARTS',
  'TRAIL',
  'TYPE',
  'UNWIND',
  'WALK',
];

/**
 * The words Grafeo 0.5.43 refuses as a label, in order. So a view may not ask for them as a kind, written after a colon
 * or in a choice after IS. Fewer than it refuses as a name: Path, Match and Nothing, which GQL keeps, are labels to it.
 */
export const GRAFEO_REFUSED_KINDS: readonly string[] = [
  'ACYCLIC',
  'CAST',
  'EXCEPT',
  'FOR',
  'GROUP',
  'GROUPS',
  'INTERSECT',
  'OFFSET',
  'ORDINALITY',
  'OTHERWISE',
  'REMOVE',
  'SHORTEST',
  'SIMPLE',
  'TRAIL',
  'UNION',
  'WALK',
  'XOR',
];

const KEPT = new Set([...GQL_RESERVED, ...GQL_PRE_RESERVED, ...GQL_VALUES, ...GRAFEO_REFUSED]);
const NO_KIND = new Set(GRAFEO_REFUSED_KINDS);

/**
 * Whether a word may not name a thing or a route in a view: one GQL keeps, or Grafeo refuses. Case is ignored, as GQL's
 * keywords are read.
 */
export function isReservedName(word: string): boolean {
  return KEPT.has(word.toUpperCase());
}

/** Whether a view may not ask for a word as a kind: one Grafeo refuses as a label, in any case. */
export function isRefusedKind(word: string): boolean {
  return NO_KIND.has(word.toUpperCase());
}

/** What a person is told of a name a view may not use: the word, and another to write. */
export const nameRefusal = (kept: string): string => word('views.profile.reserved-name', { word: kept });

/** What a person is told of a kind a view may not ask for: the word, and that the kind needs another name. */
export const kindRefusal = (kept: string): string => word('views.profile.reserved-kind', { word: kept });
