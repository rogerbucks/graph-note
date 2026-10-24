/*
Checks graph spec documents in plain JavaScript. It reads GQL data blocks in the document profile, with no database.
It runs the spec's rules: types, the flat projection, certainty, paths, judgements, servings and change sets.

Usage:
  In a page:  the built file, dist/graph-spec-check.js, as one script.
              Then  GraphSpecCheck.read([blockText, …])  and  GraphSpecCheck.check(world, 'graph name', matrix).
  In Node:    require('@thoughtknot/graph-spec'), or  node bin/graph-spec-check-node.js < request.json   (the conformance suite does this)

Writes: nothing (library).

This is the entry point: it gathers the library's feature modules (see GUIDE.md) into the one API object.
esbuild.check.mjs bundles it into one self-contained file, dist/graph-spec-check.js. A browser page, an editor plugin
or a document add-in can load that file as it is. The release archive ships that file at this file's path. The library
follows gql_profile.py and graph_rules.py (python/graph_spec) function for function. The conformance suite runs both
on every case and requires the same answers. SHA-256 is computed here, synchronously, so no platform crypto is needed.
*/
'use strict';

const { GTime } = require('./values/times.js');
const { sha256hex } = require('./hashing/sha256.js');
const { jcs, hash16, basisHash } = require('./hashing/canonical-json.js');
const { named, isNamed } = require('./hashing/named.js');
const { ProfileError } = require('./reader/profile-error.js');
const { LIMITS } = require('./reader/limits.js');
const { secretsIn, secretsInGraph } = require('./reader/secrets.js');
const { COMMENT_RULE, COMMENT_FIX, header, tokens, quote } = require('./reader/tokens.js');
const { checkSyntax } = require('./reader/syntax.js');
const { Store, read } = require('./reader/store.js');
const { ownedComments } = require('./reader/owned-comments.js');
const { notes } = require('./reader/notes.js');
const { schemaFor, worldFromStore, canon, Graph } = require('./graph/graph.js');
const { SPEC_SCHEMA, SPEC_NODES, SPEC_MARKERS, SPEC_EDGES, types, typed, untyped } = require('./rules/types.js');
const { project, rebuild, projectsBack } = require('./rules/projection.js');
const { section20 } = require('./rules/certainty.js');
const { pathsRules, viewAt, below } = require('./rules/paths.js');
const { lensBuckets } = require('./rules/lenses.js');
const { review, whyLayer, judgementsRules, proposerWarnings } = require('./rules/judgements.js');
const { servedRules } = require('./rules/servings.js');
const { check } = require('./rules/check.js');
const { completeness } = require('./rules/completeness.js');
const { readings } = require('./rules/readings.js');
const { guessReadings, reverseReading } = require('./rules/guessed-readings.js');
const { clipShown, shownText, shownTexts } = require('./rules/shown-text.js');
const { lint } = require('./changesets/dialect-lint.js');
const { changesetHeader, checkChangeset } = require('./changesets/changeset.js');
const { splitChangeset, readChange, changeId } = require('./changesets/changes.js');
const { pyrepr } = require('./joins/python-text.js');
const { parseDoc } = require('./joins/normalise.js');
const { union } = require('./joins/union.js');
const { merge3 } = require('./joins/merge3.js');
const { finish } = require('./joins/finish.js');
const { configFrom, joinDocs } = require('./joins/join-docs.js');
const { SCHEMA_LABELS, mermaidGraph, legend, word, mermaidPath } = require('./views/mermaid.js');
const { views } = require('./views/views.js');
const { louvain } = require('./clusters/louvain.js');
const { clustersOf } = require('./clusters/clusters.js');
const { centroidId, centroidsOf } = require('./clusters/centroids.js');
const { clusterCycles, cycleView } = require('./clusters/cycles.js');
const { clusterCertainty } = require('./clusters/cohesion.js');
const processCore = require('./process/core.js');
const runs = require('./process/runs.js');
const altitude = require('./altitude/altitude.js');
const { lensesOf, runLens } = require('./lenses/saved-lenses.js');
const { altitudeIndex, searchIndex } = require('./altitude/altitude-index.js');
const { certaintyOf, byCertainty, meshJoin } = require('./mesh/mesh-join.js');
const { asAt, lensAsAt } = require('./mesh/as-at.js');
const { afterTextMerge } = require('./mesh/after-text-merge.js');
const { sameAs } = require('./mesh/same-as.js');
const {
  contextsOf,
  contextGuesses,
  comparable,
  proposeSameAs,
  sameAsAcross,
  worldIn,
  searchContexts,
} = require('./mesh/contexts.js');
const { inherited, instancesOf, typeOf } = require('./mesh/types-instances.js');

// The API, its names in the order they have always had; test/graph-spec-check-api.test.mjs holds the list.
module.exports = {
  SPEC_SCHEMA,
  SPEC_NODES,
  SPEC_MARKERS,
  SPEC_EDGES,
  SCHEMA_LABELS,
  types,
  views,
  mermaidGraph,
  legend,
  readings,
  word,
  guessReadings,
  reverseReading,
  COMMENT_RULE,
  COMMENT_FIX,
  schemaFor,
  mermaidPath,
  sha256hex,
  jcs,
  hash16,
  basisHash,
  named,
  isNamed,
  GTime,
  ProfileError,
  header,
  tokens,
  checkSyntax,
  Store,
  read,
  worldFromStore,
  canon,
  Graph,
  typed,
  untyped,
  project,
  rebuild,
  projectsBack,
  section20,
  pathsRules,
  viewAt,
  below,
  lensBuckets,
  review,
  whyLayer,
  judgementsRules,
  servedRules,
  check,
  completeness,
  lint,
  changesetHeader,
  checkChangeset,
  parseDoc,
  union,
  merge3,
  finish,
  configFrom,
  joinDocs,
  pyrepr,
  ownedComments,
  quote,
  notes,
  splitChangeset,
  readChange,
  changeId,
  proposerWarnings,
  LIMITS,
  secretsIn,
  secretsInGraph,
  shownText,
  shownTexts,
  clipShown,
  louvain,
  clustersOf,
  centroidId,
  centroidsOf,
  clusterCycles,
  cycleView,
  certaintyOf,
  byCertainty,
  meshJoin,
  asAt,
  lensAsAt,
  afterTextMerge,
  sameAs,
  typeOf,
  instancesOf,
  inherited,
  clusterCertainty,
  coreOfEight: processCore.coreOfEight,
  transitionsOf: processCore.transitionsOf,
  promoteTransition: processCore.promoteTransition,
  processPath: processCore.processPath,
  guardOf: processCore.guardOf,
  guardAllows: processCore.guardAllows,
  runningRuleOf: processCore.runningRuleOf,
  overrideRunningRule: processCore.overrideRunningRule,
  runLog: runs.runLog,
  currentOf: runs.currentOf,
  enterState: runs.enterState,
  leaveState: runs.leaveState,
  moveRun: runs.moveRun,
  withEntries: runs.withEntries,
  refreshCurrent: runs.refreshCurrent,
  atAltitude: altitude.atAltitude,
  profilesOf: altitude.profilesOf,
  audienceProjection: altitude.audienceProjection,
  altitudesIn: altitude.altitudesIn,
  byAxes: altitude.byAxes,
  lensesOf,
  runLens,
  altitudeIndex,
  searchIndex,
  contextsOf,
  contextGuesses,
  comparable,
  proposeSameAs,
  sameAsAcross,
  worldIn,
  searchContexts,
};
