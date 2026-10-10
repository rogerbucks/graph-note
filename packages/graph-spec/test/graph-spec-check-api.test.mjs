// The entry point, src/graph-spec-check.js, gathers the feature modules into the API the library has always had: the
// same names, in the same order, as the one file exported before it was split into modules (9 Oct 2026). Pages, the
// plugin and the vault's conformance suite call these names, so none is lost, renamed or added by accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');

// Object.keys of the API at 04b1a40, the last commit with the library in one file.
const NAMES = [
  'SPEC_SCHEMA',
  'SPEC_NODES',
  'SPEC_MARKERS',
  'SPEC_EDGES',
  'SCHEMA_LABELS',
  'types',
  'views',
  'mermaidGraph',
  'legend',
  'readings',
  'word',
  'guessReadings',
  'reverseReading',
  'COMMENT_RULE',
  'COMMENT_FIX',
  'schemaFor',
  'mermaidPath',
  'sha256hex',
  'jcs',
  'hash16',
  'basisHash',
  'GTime',
  'ProfileError',
  'header',
  'tokens',
  'checkSyntax',
  'Store',
  'read',
  'worldFromStore',
  'canon',
  'Graph',
  'typed',
  'untyped',
  'project',
  'rebuild',
  'projectsBack',
  'section20',
  'pathsRules',
  'viewAt',
  'below',
  'lensBuckets',
  'review',
  'whyLayer',
  'judgementsRules',
  'servedRules',
  'check',
  'completeness',
  'lint',
  'changesetHeader',
  'checkChangeset',
  'parseDoc',
  'union',
  'merge3',
  'finish',
  'configFrom',
  'joinDocs',
  'pyrepr',
  // added since: §26 and §27, the comments an element owns (11 Oct 2026)
  'ownedComments',
  'quote', // a text quoted as the profile writes it (req:3.gql-escapes, 11 Oct 2026)
];

test('the entry point exports exactly the names the one file did, in its order', () => {
  assert.deepEqual(Object.keys(gs), NAMES);
});

test('every name is defined: each module gives the entry point what it asks for', () => {
  assert.deepEqual(
    NAMES.filter((n) => gs[n] === undefined),
    [],
  );
});
