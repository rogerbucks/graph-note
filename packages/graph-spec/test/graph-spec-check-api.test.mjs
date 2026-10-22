// The entry point, src/graph-spec-check.js, gathers the feature modules into the API the library has always had. It
// has the same names, in the same order, as the one file exported before it was split into modules (9 Oct 2026). Pages,
// the plugin and the vault's conformance suite call these names, so none is lost, renamed or added by accident.
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
  'named',
  'isNamed',
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
  'notes', // the notes on things and links, and the lines a note above belongs to none of (editor spec §24, 13 Oct 2026)
  // the statements of a change set as the check reads them, so the editor reads and names a change as it does (16 Oct
  // 2026)
  'splitChangeset',
  'readChange',
  'changeId',
  // a proposal's proposer is read through WAS_ATTRIBUTED_TO; the old form is warned of (16 Oct 2026)
  'proposerWarnings',
  // the limits every reader, check and join stops at (editor spec §51, spec_read_limits)
  'LIMITS',
  // the shapes of secret a reader refuses to serve (editor spec §51, spec_secrets_and_fences)
  'secretsIn',
  'secretsInGraph',
  'shownText',
  'clipShown',
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
