/*
Runs graph-spec-check.js under Node for the conformance suite — one JSON request on stdin, one JSON answer on stdout.

Usage:
  echo '{"blocks": ["// graph: g\nINSERT (a:A {id: \"a\"})"], "graphs": ["g"]}' | node zzSupport/_scripts/graph-spec-check-node.cjs

Writes: nothing (prints to stdout).

Category: Checks — graph model

WHY (5 Oct 2026): phase 3 of Standards/Graph spec portable checker.aiplan.md. The checker itself is one plain JavaScript file
with nothing Node-specific. This harness is the only Node-specific part. So the Python suite can run the very file a
browser page loads, and require the same answers as the Python checker. A target system never needs Node or this file.
WHY GRAPH_SPEC_VENDOR (9 Oct 2026): as graph_spec_host.py. In the repository it names the build of the checker to run.
WHY owned (14 Oct 2026): the reader case asks for the notes and //@ lines each element owns (§26, §27).
So the suite holds the JavaScript reader to the Python one on every block (req:26.two-readers, req:27.two-readers).
*/
const path = require('path');
const VENDOR = process.env.GRAPH_SPEC_VENDOR || path.join(__dirname, 'vendor', 'graph-spec');
const C = require(path.join(VENDOR, 'js', 'graph-spec-check.js'));   // the vendored release — never edit it there
let input = '';
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  const q = JSON.parse(input || '{}'), sw = new Set(q.switches || []), out = { canon: {}, verdicts: {}, reviews: [], whys: [], changesets: [], lint: [] };
  try {
    const w = C.worldFromStore(C.read(q.blocks || []));
    out.views = {};
    for (const g of q.graphs || []) { out.canon[g] = C.canon(w[g]); out.verdicts[g] = C.check(w, g, q.matrix, sw); out.views[g] = C.views(w[g], w[g].labelled('ElementType').length ? undefined : C.schemaFor(w, g)[1]); }
    for (const r of q.reviews || []) out.reviews.push(C.review(w, r, sw));
    for (const y of q.whys || []) out.whys.push(C.whyLayer(w, y.graph, y.data, y.top, y.level, sw));
    for (const t of q.lint || []) out.lint.push(C.lint(t).map(f => f.trap));
  } catch (e) { out.error = String(e && e.message || e); }
  for (const c of q.changesets || []) {
    try { const r = C.checkChangeset(c.base, c.block, q.matrix, sw); out.changesets.push({ failed: r.results.filter(x => !x[1]).map(x => x[0]).sort(), after: r.after, refreshes: (r.header && r.header.refreshes) || [] }); }
    catch (e) { out.changesets.push({ error: String(e && e.message || e) }); }
  }
  if (q.join) { try { out.join = C.joinDocs(q.join); } catch (e) { out.join = { error: String(e && e.message || e) }; } }
  if (q.completeness) { try { const w = C.worldFromStore(C.read(q.blocks || [])); out.completeness = C.completeness(w[q.completeness.graph], q.completeness.today); } catch (e) { out.completeness = { error: String(e && e.message || e) }; } }
  if (q.project) { try { C.project(C.worldFromStore(C.read(q.blocks || []))[q.project]); out.project_error = ''; } catch (e) { out.project_error = String(e && e.message || e); } }
  if (q.owned) out.owned = q.owned.map(b => { try { return C.ownedComments(b); } catch (e) { return { error: String(e && e.message || e) }; } });
  if (q.sha256) out.sha256 = q.sha256.map(C.sha256hex);
  if (q.jcs) out.jcs = q.jcs.map(C.jcs);
  process.stdout.write(JSON.stringify(out));
});
