// Characterisation cases for the graph-spec library: requests in the shape the
// Node adapter (bin/graph-spec-check-node.js) takes. Every graph here is
// written for this repository. The expected answers in expected.json were recorded
// from the library before it moved into this repository, so a case that
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
        "(t_person:ElementType {name: 'Person', kind: 'node'}),",
        '(u_schema)-[:DECLARES]->(t_book),',
        "(ada:Person {name: 'Ada'}),",
        "(notes:Book {title: 'Notes'})",
      ),
    ],
    graphs: ['undeclared'],
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
