/*
Runs graph-spec-check.js under Node — one JSON request on stdin, one JSON answer on stdout.

Usage:
  echo '{"blocks": ["// graph: g\nINSERT (a:A {id: \"a\"})"], "graphs": ["g"]}' | node bin/graph-spec-check-node.js

Writes: nothing (prints to stdout).

The checker itself is plain JavaScript with nothing Node-specific; this harness is the only Node-specific part, so a
Python test suite can run the checker a browser page loads and require the same answers as the Python checker. A system
that only loads the checker never needs Node or this file. In the repository ../src/graph-spec-check.js is the entry point
over the feature modules; in the release archive it is the built file, all of them in one (GUIDE.md).
*/
const C = require('../src/graph-spec-check.js');
let input = '';
process.stdin.on('data', (d) => {
  input += d;
});
process.stdin.on('end', () => {
  const q = JSON.parse(input || '{}'),
    sw = new Set(q.switches || []),
    out = { canon: {}, verdicts: {}, reviews: [], whys: [], changesets: [], lint: [] };
  try {
    const w = C.worldFromStore(C.read(q.blocks || []));
    out.views = {};
    for (const g of q.graphs || []) {
      out.canon[g] = C.canon(w[g]);
      out.verdicts[g] = C.check(w, g, q.matrix, sw);
      out.views[g] = C.views(w[g], w[g].labelled('ElementType').length ? undefined : C.schemaFor(w, g)[1]);
    }
    for (const r of q.reviews || []) out.reviews.push(C.review(w, r, sw));
    for (const y of q.whys || []) out.whys.push(C.whyLayer(w, y.graph, y.data, y.top, y.level, sw));
    for (const t of q.lint || []) out.lint.push(C.lint(t).map((f) => f.trap));
  } catch (e) {
    out.error = String((e && e.message) || e);
  }
  for (const c of q.changesets || []) {
    try {
      const r = C.checkChangeset(c.base, c.block, q.matrix, sw);
      out.changesets.push({
        failed: r.results
          .filter((x) => !x[1])
          .map((x) => x[0])
          .sort(),
        after: r.after,
        refreshes: (r.header && r.header.refreshes) || [],
      });
    } catch (e) {
      out.changesets.push({ error: String((e && e.message) || e) });
    }
  }
  if (q.join) {
    try {
      out.join = C.joinDocs(q.join);
    } catch (e) {
      out.join = { error: String((e && e.message) || e) };
    }
  }
  if (q.completeness) {
    try {
      const w = C.worldFromStore(C.read(q.blocks || []));
      out.completeness = C.completeness(w[q.completeness.graph], q.completeness.today);
    } catch (e) {
      out.completeness = { error: String((e && e.message) || e) };
    }
  }
  if (q.project) {
    try {
      C.project(C.worldFromStore(C.read(q.blocks || []))[q.project]);
      out.project_error = '';
    } catch (e) {
      out.project_error = String((e && e.message) || e);
    }
  }
  if (q.sha256) out.sha256 = q.sha256.map(C.sha256hex);
  if (q.jcs) out.jcs = q.jcs.map(C.jcs);
  process.stdout.write(JSON.stringify(out));
});
