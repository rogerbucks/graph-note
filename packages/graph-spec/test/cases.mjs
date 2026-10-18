// Characterisation cases for the graph-spec library: requests in the shape the
// Node adapter (bin/graph-spec-check-node.js) takes. Every graph here is
// written for this repository. The expected answers in expected.json were recorded
// from the library before it moved into this repository. So a case that
// changes answer is a change in behaviour.
const lines = (...xs) => xs.join('\n');

const library = [
  lines(
    '// graph: library',
    'INSERT',
    "(t_book:ElementType {id: 'type:Book', name: 'Book', kind: 'node'}),",
    "(t_person:ElementType {id: 'type:Person', name: 'Person', kind: 'node'}),",
    "(t_wrote:ElementType {id: 'type:WROTE', name: 'WROTE', kind: 'edge', reading: 'wrote', reverse_name: 'written by'}),",
    // declared by the graph's GraphMeta, as §5 asks (since 8 Oct 2026 an undeclared ElementType types nothing)
    "(library_schema:GraphMeta {id: 'meta:library', graph: 'library', schema: 'library@1'}),",
    '(library_schema)-[:DECLARES]->(t_book),',
    '(library_schema)-[:DECLARES]->(t_person),',
    '(library_schema)-[:DECLARES]->(t_wrote),',
    "(ada:Person {name: 'Ada'}),",
    "(notes:Book {title: 'Notes on the engine', published: DATE '1843-10-01'}),",
    '(ada)-[:WROTE]->(notes)',
  ),
  lines('// graph: library', "MATCH (b:Book {id: 'notes'})", 'SET b.pages = 66'),
  lines(
    '// graph: library',
    "(grace:Person {name: 'Grace', checked: DATETIME '2026-10-07T09:30:00+01:00'}),",
    '(grace)-[:WROTE {year: 1952}]->(notes)',
  ),
  lines('// graph: library', 'SET notes.shelf = 3'),
];

export const cases = {
  'a typed graph, read through every shortcut': {
    blocks: library,
    graphs: ['library'],
    matrix: {},
  },

  'a schema its GraphMeta does not declare types nothing (§5)': {
    blocks: [
      lines(
        '// graph: undeclared',
        "(u_schema:GraphMeta {graph: 'undeclared', schema: 'undeclared@1'}),",
        "(t_book:ElementType {name: 'Book', kind: 'node'}),",
        "(t_author:ElementType {name: 'Author', kind: 'node'}),",
        '(u_schema)-[:DECLARES]->(t_book),',
        "(ada:Author {name: 'Ada'}),",
        "(notes:Book {title: 'Notes'})",
      ),
    ],
    graphs: ['undeclared'],
    matrix: {},
  },

  'a relationship type written without its colon, read as the graph’s one type of that name (§3)': {
    blocks: [
      lines('// graph: bare', "(r:Reason {title: 'Sun'}),", "(o:Option {name: 'Coast'}),", '(r)-[:FAVOURS]->(o)'),
      lines('// graph: bare', "(s:Reason {title: 'Quiet'}),", '(s)-[favours]->(o)'),
    ],
    graphs: ['bare'],
    matrix: {},
  },

  'a first use written without its colon is refused (§3)': {
    blocks: [
      lines('// graph: bare', "(r:Reason {title: 'Sun'}),", "(o:Option {name: 'Coast'}),", '(r)-[favours]->(o)'),
    ],
    graphs: ['bare'],
    matrix: {},
  },

  // Whitespace is what GQL names (§3). It is TAB, LF, VT, FF, CR and U+001C–U+001F. It is also the space, U+00A0,
  // U+1680, U+180E and U+2000–U+200A. And it is U+2028, U+2029, U+202F, U+205F and U+3000. It is never U+0085, U+FEFF
  // or U+200B. A line ends at LF only.
  // Every reader uses that one set, not its language's own idea of whitespace (decided 10 Oct 2026).
  'whitespace inside a string is kept as written, line and paragraph separators too (§3)': {
    blocks: [
      lines(
        '// graph: ws_strings',
        "(a:T {name: 'no\xa0break'}),",
        "(b:T {name: 'line\u{2028}separator'}),",
        "(c:T {name: 'paragraph\u{2029}separator'}),",
        "(d:T {name: 'byte\u{feff}order'}),",
        "(e:T {name: 'vowel\u{180e}separator'}),",
        "(f:T {name: 'file\x1cseparator'}),",
        "(g:T {name: 'next\x85line'}),",
        // req:3.gql-escapes: the line separator by its GQL escape — once written as a backslash before the character
        "(h:T {name: 'escaped\\" + "u2028separator'})",
      ),
    ],
    graphs: ['ws_strings'],
    matrix: {},
  },
  'every whitespace character GQL names parts words and items, before keywords too (§3)': {
    blocks: [
      lines(
        '// graph: ws_parts',
        [...'\t\v\f\r \x1c\x1d\x1e\x1f\xa0\u{1680}\u{180e}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}']
          .concat([...'\u{2007}\u{2008}\u{2009}\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}'])
          .map((s, i) => `${s}(n${i}:T${s}{name:${s}'n${i}'})${s}`)
          .join(','),
      ),
      lines(
        '//\u{180e}graph:\u{3000}ws_parts',
        "\u{180e}MATCH\u{3000}(m:T\xa0{id:\u{2028}'n0'})",
        '\x1fSET\u{205f}m.seen\u{2009}=\u{200a}TRUE',
      ),
    ],
    graphs: ['ws_parts'],
    matrix: {},
  },

  'a byte-order mark is not whitespace: before MATCH it is refused, on the line it is on (§3)': {
    blocks: [
      lines('// graph: ws_bom', "(a:T {name: 'A'}),", "(b:T {name: 'B'})"),
      lines(
        '// graph: ws_bom',
        '// a comment\u{2028}that a line separator does not end',
        "\u{feff}MATCH (a:T {id: 'a'})",
        'SET a.seen = TRUE',
      ),
    ],
    graphs: ['ws_bom'],
    matrix: {},
  },

  'U+0085 is not whitespace, while U+001C is (§3)': {
    blocks: [lines('// graph: ws_nel', "(a:T {name: 'A'}),\x1c(b:T {name: 'B'}),\x85(c:T {name: 'C'})")],
    graphs: ['ws_nel'],
    matrix: {},
  },

  'a draft with near-duplicate kinds and types': {
    blocks: [
      lines(
        '// graph: draft',
        "(a:Book {title: 'One'}),",
        "(b:Bok {title: 'Two'}),",
        "(c:Person {name: 'Lin'}),",
        '(c)-[:WROTE]->(a),',
        '(c)-[:WRITE]->(b)',
      ),
    ],
    graphs: ['draft'],
    matrix: {},
  },

  'a graph name that is not one word': { blocks: ["// graph: reader-choice\n(a:A {name: 'x'})"], graphs: [] },
  'a name used before it is written': {
    blocks: ["// graph: g\n(a)-[:LINKS]->(b), (a:A {name: 'x'}), (b:B {name: 'y'})"],
    graphs: [],
  },
  'an id written twice': { blocks: ["// graph: g\n(a:A {name: 'x'})", "// graph: g\n(a:A {name: 'y'})"], graphs: [] },
  'an instant with no offset': { blocks: ["// graph: g\n(a:A {at: DATETIME '2026-10-07T09:30:00'})"], graphs: [] },
  'a MATCH that finds nothing': { blocks: ["// graph: g\nMATCH (x:A {id: 'missing'})\nSET x.n = 1"], graphs: [] },
  'a query block offered as data': { blocks: ['// graph: g · QUERY\nMATCH (n) RETURN n'], graphs: [] },
  'a bare name that names nothing': { blocks: ["// graph: g\n(a:A {name: 'x'}),\n(a)-[:LINKS]->(nobody)"], graphs: [] },

  'certainty: likelihoods, assessments and evidence': {
    blocks: [
      lines(
        '// graph: forecast',
        "(likely:LikelihoodBand {term: 'likely'}),",
        "(unlikely:LikelihoodBand {term: 'unlikely'}),",
        "(rain:Claim {text: 'It rains tomorrow', likelihood: 'likely', confidence: 'moderate', status: 'open'}),",
        "(wind:Claim {text: 'It is windy tomorrow', likelihood: 'unlikely', confidence: 'high', status: 'open'}),",
        "(a1:Assessment {likelihood: 'unlikely', at: DATETIME '2026-10-01T09:00:00+00:00'}),",
        "(a2:Assessment {likelihood: 'likely', at: DATETIME '2026-10-02T09:00:00+00:00'}),",
        "(a3:Assessment {likelihood: 'unlikely', at: DATETIME '2026-10-02T09:00:00+00:00'}),",
        '(a1)-[:ASSESSES]->(rain),',
        '(a2)-[:ASSESSES]->(rain),',
        '(a3)-[:ASSESSES]->(wind),',
        "(radar:Source {name: 'Radar'}),",
        "(e1:Evidence {says: 'Cloud is building'}),",
        '(e1)-[:FROM]->(radar),',
        '(rain)-[:SUPPORTED_BY]->(e1)',
      ),
    ],
    graphs: ['forecast'],
    matrix: {},
  },

  'paths: a story told at two altitudes': {
    blocks: [
      lines(
        '// graph: story',
        "(f1:Fact {name: 'Rain fell'}),",
        "(f2:Fact {name: 'The river rose'}),",
        "(f3:Fact {name: 'The bridge closed'}),",
        "(inner:Path {name: 'The flood', altitude: 1}),",
        "(outer:Path {name: 'The week', altitude: 2}),",
        '(inner)-[:STEP {seq: 1}]->(f1),',
        '(inner)-[:STEP {seq: 2}]->(f2),',
        '(outer)-[:STEP {seq: 1}]->(inner),',
        '(outer)-[:STEP {seq: 2}]->(f3)',
      ),
    ],
    graphs: ['story'],
    matrix: {},
  },

  'the dialect linter': {
    lint: [
      'MATCH (n:Book) RETURN n.title',
      'MATCH (n:Book) RETURN n.for',
      'MATCH (a)-[:LINKS]->(a) RETURN a',
      "RETURN ZONED DATETIME('2026-01-01T00:00:00Z')",
      'MATCH (n) RETURN sum(n.x) + n.y',
      'MATCH (n) SET n.x = 1 INSERT (m:A)',
      "RETURN X'00'",
      "// graph: bad-name\n(a:A {name: 'x'})",
    ],
  },

  'completeness: a rule met, missed and parked': {
    blocks: [
      lines(
        '// graph: shelf',
        "(r1:Cardinality {kind: 'Book', relationship: 'WROTE', direction: 'in', min: 1, says: 'every book has an author'}),",
        "(r2:Cardinality {kind: 'Book', says: 'a rule with parts missing'}),",
        "(b1:Book {title: 'Has an author'}),",
        "(b2:Book {title: 'Has none'}),",
        "(b3:Book {title: 'Parked'}),",
        "(p1:Person {name: 'Sam'}),",
        '(p1)-[:WROTE]->(b1),',
        "(d1:Deferred {rule: 'r1', what: 'find the author', why: 'the record is lost', revisit_by: DATE '2026-01-01'}),",
        '(d1)-[:DEFERS]->(b3)',
      ),
    ],
    graphs: [],
    completeness: { graph: 'shelf', today: '2026-10-07' },
  },

  'a join of two documents that disagree': {
    join: {
      docs: [
        lines(
          '// graph: shop · document doc:shop-a · schema s1 · as of 2026-10-01',
          "(widget:Product {name: 'Widget', price: 10, colour: 'blue'}),",
          "(acme:Maker {name: 'Acme'}),",
          '(widget)-[:MADE_BY]->(acme)',
        ),
        lines(
          '// graph: shop · document doc:shop-b · schema s1 · as of 2026-10-02',
          "(widget:Product:Gadget {name: 'Widget', price: 12, colour: 'blue'}),",
          "(acme:Maker {name: 'Acme'}),",
          "(other:Maker {name: 'Acme'}),",
          '(widget)-[:MADE_BY]->(acme)',
        ),
      ],
      base: null,
      config: {},
      findings: [],
    },
  },

  // W3C PROV is normative for provenance (graph spec §11, §12, §24; Roger, 16 Oct 2026).
  // - A derivation links to its rule with HAD_PLAN.
  // - An attribution goes to an agent.
  // - A revision is generated after what it supersedes.
  'provenance kept: a plan, an agent and a revision in order': {
    blocks: [
      lines(
        '// graph: prov_kept',
        "(total_rule:Rule {id: 'rule:total@1', name: 'Total'}),",
        "(derive:Activity {name: 'Derive totals'}),",
        '(derive)-[:HAD_PLAN]->(total_rule),',
        "(ada:Person {name: 'Ada'}),",
        "(acme:Organization {name: 'Acme'}),",
        "(importer:SoftwareAgent {name: 'Importer'}),",
        "(bot:Model {name: 'Drafter'}),",
        "(v1:Doc {title: 'One', generated_at: DATETIME '2026-09-01T00:00:00+00:00'}),",
        "(v2:Doc {title: 'Two', generated_at: DATE '2026-09-01'}),",
        "(v3:Doc {title: 'Three'}),",
        '(v2)-[:SUPERSEDES]->(v1),',
        '(v3)-[:SUPERSEDES]->(v2),',
        '(v1)-[:WAS_ATTRIBUTED_TO]->(ada),',
        '(v2)-[:WAS_ATTRIBUTED_TO]->(acme),',
        '(derive)-[:WAS_ATTRIBUTED_TO]->(importer),',
        '(v3)-[:WAS_ATTRIBUTED_TO]->(bot)',
      ),
    ],
    graphs: ['prov_kept'],
    matrix: {},
  },

  'provenance broken: a plan that is no rule, no agent and a revision out of order': {
    blocks: [
      lines(
        '// graph: prov_broken',
        "(total_rule:Rule {id: 'rule:total@1', name: 'Total'}),",
        "(other_rule:Rule {id: 'rule:other@1', name: 'Other'}),",
        "(derive:Activity {name: 'Derive totals'}),",
        "(derive_wrong:Activity {name: 'Derive others'}),",
        '(derive)-[:HAD_PLAN]->(total_rule),',
        '(derive_wrong)-[:HAD_PLAN]->(other_rule),',
        '(derive_wrong)-[:HAD_PLAN]->(derive),',
        "(v1:Doc {title: 'One', generated_at: DATETIME '2026-09-01T00:00:00+00:00'}),",
        "(v2:Doc {title: 'Two', generated_at: DATETIME '2026-08-01T00:00:00+00:00'}),",
        "(v3:Doc {title: 'Three', generated_at: DATE '2026-07-01'}),",
        '(v2)-[:SUPERSEDES]->(v1),',
        '(v3)-[:SUPERSEDES]->(v1),',
        '(v1)-[:WAS_ATTRIBUTED_TO]->(total_rule),',
        '(v2)-[:WAS_ATTRIBUTED_TO]->(v3)',
      ),
    ],
    graphs: ['prov_broken'],
    matrix: {},
  },

  'hashes and canonical JSON': {
    sha256: ['', 'abc', 'graph — notes ✓'],
    jcs: [{ b: 2, a: [1, 'x', true, null], c: { z: 1, y: 'é' } }, 'plain', 1.5],
  },
};

/** A change set against the library graph, made once its hash is known. */
export const changesetCase = (against) => ({
  blocks: library,
  graphs: [],
  matrix: {},
  changesets: [
    {
      base: library,
      block: lines(
        `// graph: library · CHANGE SET cs1 · against ${against} · by ada`,
        "(more:Book {title: 'A second book'}),",
        '(ada)-[:WROTE]->(more)',
      ),
    },
    {
      base: library,
      block: lines(
        '// graph: library · CHANGE SET cs2 · against 0000000000000000 · by ada',
        "(late:Book {title: 'Made against an old state'})",
      ),
    },
  ],
});
