/*
Checks graph spec documents in plain JavaScript — reads GQL data blocks in the document profile, with no database, and runs the spec's rules: types, the flat projection, certainty, paths, judgements, servings and change sets.

Usage:
  In a page:  <script src="graph-spec-check.js"></script>  then  GraphSpecCheck.read([blockText, …])  and  GraphSpecCheck.check(world, 'graph name', matrix)
  In Node:    require('@graph-note/graph-spec'), or  node bin/graph-spec-check-node.js < request.json   (the conformance suite does this)

Writes: nothing (library).

One plain file — no packages, no build step, nothing Node-specific — so a browser page, an editor plugin or a document add-in
can load it. It follows gql_profile.py and graph_rules.py (python/graph_spec) function for function; the conformance suite runs
both on every case and requires the same answers. SHA-256 is computed here, synchronously, so no platform crypto is needed.
*/
/* global module -- the export for Node, beside the page global below */
(function (root) {
  'use strict';

  // ── SHA-256 and RFC 8785 canonical JSON ─────────────────────────────────────────────────────────
  const K = [], H0 = [];
  (function () {
    const primes = []; for (let n = 2; primes.length < 64; n++) { if (primes.every(p => n % p)) primes.push(n); }
    const frac = x => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
    primes.forEach((p, i) => { K.push(frac(Math.cbrt(p))); if (i < 8) H0.push(frac(Math.sqrt(p))); });
  })();
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  function sha256hex(str) {
    const bytes = new TextEncoder().encode(str), l = bytes.length, size = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(size); m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer), bits = l * 8; dv.setUint32(size - 4, bits >>> 0); dv.setUint32(size - 8, Math.floor(bits / 4294967296));
    let H = H0.slice(); const W = new Uint32Array(64);
    for (let i = 0; i < size; i += 64) {
      for (let t = 0; t < 16; t++) W[t] = dv.getUint32(i + t * 4);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3), s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) >>> 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H = [a, b, c, d, e, f, g, h].map((x, k) => (H[k] + x) >>> 0);
    }
    return H.map(x => x.toString(16).padStart(8, '0')).join('');
  }

  // A date or an instant, as the profile allows: DATE '…' kept as its day; DATETIME '…' kept as its UTC time.
  class GTime {
    constructor(kind, s) { this.kind = kind; this.s = s; }
    valueOf() { return this.s; } toString() { return this.s; } toJSON() { return this.s; }
  }
  const isTime = v => v instanceof GTime;
  const norm = v => isTime(v) ? v.s : v;                                                   // as hashed (rule:basis-hash@1)
  const cnorm = v => isTime(v) ? (v.kind === 'datetime' ? v.s + '+00:00' : v.s) : v;      // as in the canonical graph
  function same(a, b) {
    if (isTime(a) || isTime(b)) return isTime(a) && isTime(b) && a.kind === b.kind && a.s === b.s;
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
    return a === b;
  }
  function jcs(v) {
    if (v === null || v === undefined) return 'null';
    if (isTime(v)) return JSON.stringify(v.s);
    if (typeof v === 'boolean' || typeof v === 'number') { if (typeof v === 'number' && !isFinite(v)) throw new Error('RFC 8785 has no NaN or infinity'); return JSON.stringify(v); }
    if (typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
  }
  const hash16 = o => sha256hex(jcs(o)).slice(0, 16);
  const basisHash = (props, reads) => { const o = {}; reads.split(',').map(x => x.trim()).forEach(k => { o[k] = norm(props[k] === undefined ? null : props[k]); }); return hash16(o); };
  const byKey = f => (a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; };

  // ── the document profile reader (gql_profile.py) ───────────────────────────────────────────────
  class ProfileError extends Error { constructor(line, message, fix) { super(`line ${line}: ${message} — ${fix}`); this.line = line; this.msg = message; this.fix = fix; } }
  const KEYWORDS = new Set(['INSERT', 'MATCH', 'SET', 'DATE', 'DATETIME', 'TRUE', 'FALSE']);
  const TOKEN = /\s*(?:('(?:[^'\\]|\\.)*')|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(->)|([()[\]{}:,.=-]))/y;
  function header(block) {
    const first = (block.split('\n').find(l => l.trim()) || '');
    if (/^\s*\/\/\s*excerpt\b/i.test(first)) return [null, 'excerpt'];   // an illustration, said to be one (§3)
    const m = /^\s*\/\/\s*graph:\s*(\S+)(.*)$/.exec(first);
    if (!m) throw new ProfileError(1, 'the block names no graph', "start it with '// graph: <name>' (§3)");
    const kind = /·\s*SCHEMA\s+\S+/.test(m[2]) ? 'schema' : /·\s*excerpt\b/i.test(m[2]) ? 'excerpt' : /·\s*QUERY\b/.test(m[2]) ? 'query' : /·\s*CHANGE SET\b/.test(m[2]) ? 'changeset' : 'data';
    if (kind !== 'excerpt' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(m[1]))   // a GQL engine names a graph by an identifier — 'reader-choice' cannot be loaded
      throw new ProfileError(1, `the graph name '${m[1]}' is not one word`, 'use letters, digits and underscores only — reader_choice, not reader-choice (§3)');
    return [m[1], kind];
  }
  function tokens(block) {
    const out = [];
    block.split('\n').forEach((raw, i) => {
      const n = i + 1; if (raw.trim().startsWith('//')) return;
      let pos = 0;
      while (pos < raw.length) {
        if (!raw.slice(pos).trim()) break;
        TOKEN.lastIndex = pos; const m = TOKEN.exec(raw);
        if (!m) throw new ProfileError(n, `cannot read '${raw.slice(pos).trim().slice(0, 20)}'`, 'a data block holds only nodes, relationships and simple values');
        let kind = m[1] !== undefined ? 'str' : m[2] !== undefined ? 'num' : m[3] !== undefined ? 'id' : m[4] !== undefined ? 'arrow' : 'p';
        const raw_text = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]; let text = raw_text;
        if (kind === 'id' && KEYWORDS.has(text.toUpperCase())) { kind = 'kw'; text = text.toUpperCase(); }
        out.push([kind, text, n, raw_text]); pos = TOKEN.lastIndex;
      }
    });
    return out;
  }
  const unquote = s => s.slice(1, -1).replace(/\\(.)/g, (_, c) => c === 'n' ? '\n' : c === 't' ? '\t' : c);
  function utcNaive(s, line) {
    const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,6}))?)?(Z|[+-]\d\d:?\d\d)?$/.exec(s);
    if (!m) throw new ProfileError(line, `'${s}' is not an instant`, "write DATETIME 'YYYY-MM-DDTHH:MM:SS+HH:MM'");
    if (!m[8]) throw new ProfileError(line, `'${s}' has no offset`, 'an instant carries its offset (§9, principle 11)');
    let off = 0; if (m[8] !== 'Z') { const sg = m[8][0] === '-' ? -1 : 1, d = m[8].slice(1).replace(':', ''); off = sg * (Number(d.slice(0, 2)) * 60 + Number(d.slice(2))); }
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - off * 60000);
    const p = x => String(x).padStart(2, '0'); const micro = m[7] ? m[7].padEnd(6, '0') : '';
    return `${t.getUTCFullYear().toString().padStart(4, '0')}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}` + (micro && Number(micro) ? '.' + micro : '');
  }
  class Parser {
    constructor(t) { this.t = t; this.i = 0; }
    peek(k = 0) { return this.t[this.i + k] || ['end', '', this.t.length ? this.t[this.t.length - 1][2] : 1, '']; }
    line() { return this.peek()[2]; }
    take(kind, text) {
      const tok = this.peek();
      if ((kind && tok[0] !== kind) || (text && tok[1] !== text)) throw new ProfileError(tok[2], `expected '${text || kind}', found '${tok[1] || 'the end'}'`, 'keep to the document profile (§3)');
      this.i++; return tok;
    }
    at(kind, text) { const tok = this.peek(); return (!kind || tok[0] === kind) && (!text || tok[1] === text); }
    name() { const [k, t, n, raw] = this.peek(); if (k === 'id' || k === 'kw') { this.i++; return raw; } throw new ProfileError(n, `expected a name, found '${t || 'the end'}'`, 'keep to the document profile (§3)'); }
    value() {
      const [k, t, n] = this.peek();
      if (k === 'str') { this.i++; return unquote(t); }
      if (k === 'num') { this.i++; return Number(t); }
      if (k === 'kw' && (t === 'TRUE' || t === 'FALSE')) { this.i++; return t === 'TRUE'; }
      if (k === 'kw' && t === 'DATE') {
        this.i++; const s = unquote(this.take('str')[1]);
        if (!/^\d{4}-\d\d-\d\d$/.test(s) || isNaN(Date.parse(s + 'T00:00:00Z'))) throw new ProfileError(n, `'${s}' is not a date`, "write DATE 'YYYY-MM-DD'");
        return new GTime('date', s);
      }
      if (k === 'kw' && t === 'DATETIME') { this.i++; const s = unquote(this.take('str')[1]); return new GTime('datetime', utcNaive(s, n)); }
      throw new ProfileError(n, `'${t || 'nothing'}' is not a value in the profile`, "use 'text', a number, TRUE, FALSE, DATE '…' or DATETIME '…' — no lists, no expressions");
    }
    props() {
      const out = {}; if (!this.at('p', '{')) return out;
      this.take('p', '{');
      while (!this.at('p', '}')) { const key = this.name(); this.take('p', ':'); out[key] = this.value(); if (!this.at('p', '}')) this.take('p', ','); }
      this.take('p', '}'); return out;
    }
    node() {
      const n = this.take('p', '(')[2], v = this.name(), labels = [];
      while (this.at('p', ':')) { this.take('p', ':'); labels.push(this.name()); }
      const props = this.props(); this.take('p', ')'); return { v, labels, props, line: n };
    }
    path() {
      const nodes = [this.node()], rels = [];
      while (this.at('p', '-')) {
        this.take('p', '-'); this.take('p', '['); this.take('p', ':'); const type = this.name(); const props = this.props(); this.take('p', ']'); this.take('arrow');
        rels.push({ type, props }); nodes.push(this.node());
      }
      return [nodes, rels];
    }
    statement() {
      const matches = [], paths = [], sets = [];
      while (this.at('kw', 'MATCH')) { this.take('kw', 'MATCH'); matches.push(this.node()); while (this.at('p', ',')) { this.take('p', ','); matches.push(this.node()); } }
      if (!matches.length && this.at('p', '(')) { /* the data shortcut (§3): a block that only lists things and links means INSERT */ }
      else if (!this.at('kw', 'SET')) this.take('kw', 'INSERT');   // a SET alone names its nodes, by MATCH or by id (6 Oct 2026)
      if (!this.at('kw', 'SET')) { paths.push(this.path()); while (this.at('p', ',')) { this.take('p', ','); paths.push(this.path()); } }
      if (this.at('kw', 'SET')) {
        this.take('kw', 'SET');
        for (;;) { const n = this.line(), v = this.name(); this.take('p', '.'); const key = this.name(); this.take('p', '='); sets.push([v, key, this.value(), n]); if (!this.at('p', ',')) break; this.take('p', ','); }
      }
      if (!this.at('end')) throw new ProfileError(this.line(), `unexpected '${this.peek()[1]}'`, 'a data block ends after its INSERT and SET (§3)');
      return [matches, paths, sets];
    }
  }
  function checkSyntax(block) {
    try { const [, kind] = header(block); if (kind === 'query' || kind === 'excerpt') return null; const t = tokens(block); if (t.length) { const [m, p] = new Parser(t).statement(); bindOrder(m, p); } }
    catch (e) { if (e instanceof ProfileError) return e; throw e; }
    return null;
  }
  function bindOrder(matches, paths) {   // §3: a name is reused only once its node is written — by MATCH, earlier in the block, or earlier in its path
    const writes = n => n.labels.length || Object.keys(n.props).length;
    const bound = new Set(matches.map(m => m.v)), written = new Set(paths.flatMap(([ns]) => ns.filter(writes).map(n => n.v)));
    for (const [nodes] of paths) for (const n of nodes) {
      if (writes(n)) bound.add(n.v);
      else if (!bound.has(n.v) && written.has(n.v)) throw new ProfileError(n.line, `${n.v} is used before it is written`, 'write the node before any relationship that uses it — GQL binds a name only once its node is written (§3)');
    }
  }
  class Store {
    constructor() { this.graphs = {}; this.k = 0; this.schemas = {}; this.named = {}; }   // schema name -> its graph; data graph -> the schema its header names
    graph(g) { return this.graphs[g] || (this.graphs[g] = { nodes: new Map(), edges: [] }); }
    find(g, id) { for (const [k, n] of this.graph(g).nodes) if (n.props.id === id) return k; return null; }
    apply(block) {
      let [g, kind] = header(block);
      if (kind === 'query') throw new ProfileError(1, 'this is a query block', 'queries ask questions of a graph; they are not data');
      if (kind === 'excerpt') throw new ProfileError(1, 'this is an excerpt', 'an excerpt illustrates part of a graph; it is not data');
      const first = block.split('\n').find(l => l.trim()) || '';
      if (kind === 'schema') { const name = /·\s*SCHEMA\s+(\S+)/.exec(first)[1]; g = 'schema ' + name; this.schemas[name] = g; delete this.graphs[g]; }   // a shared schema (§5), kept apart under its own name
      else { const sm = /·\s*schema\s+(\S+)/.exec(first); if (sm) this.named[g] = sm[1]; }
      const toks = tokens(block); if (!toks.length) return g;
      const [matches, paths, sets] = new Parser(toks).statement();
      const G = this.graph(g), bound = {};
      for (const m of matches) {
        const keys = Object.keys(m.props);
        if (keys.length !== 1 || keys[0] !== 'id') throw new ProfileError(m.line, 'MATCH must find a node by its id alone', "write MATCH (v:Label {id: '…'})");
        const k = this.find(g, m.props.id);
        if (k === null || !m.labels.every(l => G.nodes.get(k).labels.has(l))) throw new ProfileError(m.line, `MATCH finds no ${m.labels.join(':')} with id '${m.props.id}' in graph ${g}`, 'the node must be written earlier — in this document or one loaded before it');
        bound[m.v] = k;
      }
      const writes = n => n.labels.length || Object.keys(n.props).length;
      for (const [nodes, rels] of paths) {   // left to right, as Grafeo binds them: a name is reused only once its node is written — earlier in the block, earlier in this path, or found by MATCH (§3)
        for (const n of nodes) {
          if (writes(n)) {
            if (n.v in bound) throw new ProfileError(n.line, `${n.v} is written twice`, 'give each new node its own variable');
            if (!('id' in n.props)) n.props = Object.assign({ id: n.v }, n.props);   // a thing's name is its id (§3, 6 Oct 2026)
            if (this.find(g, n.props.id) !== null) throw new ProfileError(n.line, `id '${n.props.id}' is already a node in graph ${g}`, 'an id names one node (§10) — MATCH it to add to it, or supersede it (§12)');
            const k = 'n' + (++this.k); G.nodes.set(k, { labels: new Set(n.labels), props: Object.assign({}, n.props) }); bound[n.v] = k;
          } else if (!(n.v in bound)) {
            const later = paths.some(([ns]) => ns.some(m => m.v === n.v && writes(m)));
            if (later) throw new ProfileError(n.line, `${n.v} is used before it is written`, 'write the node before any relationship that uses it — GQL binds a name only once its node is written (§3)');
            const k = this.find(g, n.v);   // a bare name not written in this block names the existing node with that id (§3)
            if (k === null) throw new ProfileError(n.line, `no thing called ${n.v} in graph ${g}`, `check the spelling — or write it here with its kind: (${n.v}:Kind {…})`);
            bound[n.v] = k;
          }
        }
        rels.forEach((r, i) => G.edges.push([bound[nodes[i].v], r.type, bound[nodes[i + 1].v], Object.assign({}, r.props)]));
      }
      for (const [v, key, val, n] of sets) {
        if (!(v in bound) && this.find(g, v) !== null) bound[v] = this.find(g, v);   // SET name.key names the node with that id (§3)
        if (!(v in bound)) throw new ProfileError(n, `SET names ${v}, which is no thing in graph ${g}`, 'check the spelling — SET names a thing by its id');
        G.nodes.get(bound[v]).props[key] = val;
      }
      return g;
    }
  }

  // ── the plain graph (graph_rules.py) ────────────────────────────────────────────────────────────
  class Graph {
    constructor(nodes, edges) {
      this.nodes = nodes; this.edges = edges; this._out = new Map(); this._in = new Map();       // nodes: Map id -> [Set labels, props]
      for (const e of edges) { (this._out.get(e[0]) || this._out.set(e[0], []).get(e[0])).push(e); (this._in.get(e[2]) || this._in.set(e[2], []).get(e[2])).push(e); }
    }
    labelled(l) { const o = []; for (const [i, [ls]] of this.nodes) if (ls.has(l)) o.push(i); return o; }
    p(i) { return this.nodes.has(i) ? this.nodes.get(i)[1] : {}; }
    has(i, l) { return this.nodes.has(i) && this.nodes.get(i)[0].has(l); }
    out(i, t) { return (this._out.get(i) || []).filter(e => t === undefined || e[1] === t); }
    inc(i, t) { return (this._in.get(i) || []).filter(e => t === undefined || e[1] === t); }
  }
  function worldFromStore(store) {
    const out = {};
    for (const [g, G] of Object.entries(store.graphs)) {
      const byk = new Map([...G.nodes].map(([k, n]) => [k, n.props.id]));
      out[g] = new Graph(new Map([...G.nodes.values()].map(n => [n.props.id, [new Set(n.labels), Object.assign({}, n.props)]])), G.edges.map(([s, t, d, p]) => [byk.get(s), t, byk.get(d), Object.assign({}, p)]));
    }
    const schemas = {};   // shared schemas (§5) travel with the world but are not graphs in it — kept out of every listing
    for (const [name, g] of Object.entries(store.schemas || {})) if (g in out) { schemas[name] = out[g]; delete out[g]; }
    Object.defineProperty(out, '__schemas', { value: schemas, enumerable: false });
    Object.defineProperty(out, '__named', { value: Object.assign({}, store.named || {}), enumerable: false });
    return out;
  }
  const schemaFor = (w, g) => { const name = (w.__named || {})[g]; return [name, name ? (w.__schemas || {})[name] : undefined]; };
  function read(blocks) { const s = new Store(); blocks.forEach(b => s.apply(b)); return s; }
  function canon(g) {
    const pr = p => { const o = {}; for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined) o[k] = cnorm(v); return o; };
    const nodes = [...g.nodes.values()].map(([l, p]) => [[...l].sort(), pr(p)]).sort(byKey(x => x[1].id));
    const edges = g.edges.map(([s, t, d, p]) => [s, t, d, pr(p)]).sort(byKey(jcs));
    return sha256hex(jcs(nodes.concat(edges)));
  }

  // §5 types. The spec's own vocabulary is built in, because a page has no store to read it from; the spec's meta-schema
  // declares it as data, and the spec's trace check proves this copy equals it.
  const SPEC_SCHEMA = 'graph-spec@2', SPEC_NODES = ['GraphMeta', 'ElementType', 'Meta', 'Cardinality', 'Coverage'], SPEC_MARKERS = ['Meta'], SPEC_EDGES = ['DECLARES'];
  function types(g, shared, builtin = true) {
    let T = g.labelled('ElementType').map(i => g.p(i));
    if (!T.length && shared) T = shared.labelled('ElementType').map(i => shared.p(i));
    const nodes = new Set([...T.filter(t => t.kind === 'node').map(t => t.name), ...(builtin ? SPEC_NODES : [])]);
    const markers = new Set([...T.filter(t => t.kind === 'node' && t.marker === true).map(t => t.name), ...(builtin ? SPEC_MARKERS : [])]);
    markers.forEach(m => nodes.delete(m));   // a marker never types a node by itself
    return [nodes, new Set([...T.filter(t => t.kind === 'edge').map(t => t.name), ...(builtin ? SPEC_EDGES : [])]), T.filter(t => t.kind === 'edge' && !(t.reverse_name && t.reading))];
  }
  function typed(g, shared, builtin = true) {
    const [nodes, edges, unrev] = types(g, shared, builtin);
    return !unrev.length && [...g.nodes.values()].every(([l]) => [...l].some(x => nodes.has(x))) && g.edges.every(e => edges.has(e[1]));
  }
  function untyped(g, shared, builtin = true) {
    const [nodes, edges, unrev] = types(g, shared, builtin); const labels = new Set();
    for (const [l] of g.nodes.values()) if (![...l].some(x => nodes.has(x))) l.forEach(x => labels.add(x));
    return [[...labels].sort(), [...new Set(g.edges.map(e => e[1]).filter(t => !edges.has(t)))].sort(), unrev.map(t => t.name).sort()];
  }

  // §18 the flat projection, rebuilt through the reader
  const p2 = x => String(x).padStart(2, '0');
  function iso(v) {                       // as projected: an instant at UTC+10 (no daylight saving), a day as itself
    if (!isTime(v)) return v;
    if (v.kind === 'date') return v.s;
    const [d, t] = v.s.split('T'), [hh, mm, ssf] = t.split(':'), [ss, frac] = ssf.split('.');
    const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +hh + 10, +mm, +ss));
    return `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}T${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}:${p2(x.getUTCSeconds())}` + (frac ? '.' + frac : '') + '+10:00';
  }
  function project(g) {
    const blocks = {}, rels = [];
    for (const i of [...g.nodes.keys()].sort()) {
      const [l, p] = g.nodes.get(i); const b = { id: i, type: [...l].sort() };
      for (const k of Object.keys(p).sort()) { if (Array.isArray(p[k])) throw new Error(`refused: §18 — ${i}.${k} is a list`); if (k === 'type') throw new Error(`refused: §18 — ${i}.type is reserved: the flat projection uses type for a node's labels; rename the property`); if (k !== 'id' && p[k] !== null && p[k] !== undefined) b[k] = iso(p[k]); }
      blocks[i] = b;
    }
    for (const [s, t, d, p] of g.edges) {
      if (Object.keys(p).length) { const r = { from: s, relationship: t, to: d }; for (const k of Object.keys(p).sort()) if (p[k] !== null) r[k] = iso(p[k]); rels.push(r); continue; }
      (blocks[s][t.toLowerCase()] = blocks[s][t.toLowerCase()] || []).push(d);
    }
    for (const b of Object.values(blocks)) for (const [k, v] of Object.entries(b)) if (Array.isArray(v) && k !== 'type') v.sort();
    return [blocks, rels.sort(byKey(jcs))];   // by canonical text, as graph_rules.py orders them
  }
  function gqlValue(v) {
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT[\d:]+[+-]\d\d:\d\d$/.test(v)) return `DATETIME '${v}'`;
    if (typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v)) return `DATE '${v}'`;
    return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }
  function rebuild(name, blocks, rels) {
    const keys = [...new Set(Object.values(blocks).flatMap(b => Object.entries(b).filter(([k, v]) => Array.isArray(v) && k !== 'type').map(([k]) => k)))].sort();
    const v = {}; Object.keys(blocks).forEach((i, k) => { v[i] = 'n' + k; }); const lines = [];
    for (const [i, b] of Object.entries(blocks)) lines.push(` (${v[i]}:${b.type.join(':')} {` + Object.entries(b).filter(([k, x]) => k !== 'type' && !(keys.includes(k) && Array.isArray(x))).map(([k, x]) => `${k}: ${gqlValue(x)}`).join(', ') + '})');
    for (const [i, b] of Object.entries(blocks)) for (const k of keys) for (const t of (Array.isArray(b[k]) ? b[k] : [])) lines.push(` (${v[i]})-[:${k.toUpperCase()}]->(${v[t]})`);
    for (const e of rels) { const pr = Object.entries(e).filter(([k]) => !['from', 'relationship', 'to'].includes(k)).map(([k, x]) => `${k}: ${gqlValue(x)}`).join(', '); lines.push(` (${v[e.from]})-[:${e.relationship}` + (pr ? ` {${pr}}` : '') + `]->(${v[e.to]})`); }
    return `// graph: ${name}\nINSERT\n` + lines.join(',\n');
  }
  function projectsBack(g, name) {
    if (!g.nodes.size && !g.edges.length) return true;   // nothing to project
    let [blocks, rels] = project(g); blocks = JSON.parse(JSON.stringify(blocks)); rels = JSON.parse(JSON.stringify(rels));
    const s = new Store(); s.apply(rebuild(name, blocks, rels)); return canon(worldFromStore(s)[name]) === canon(g);
  }

  // §20 certainty
  const LIKELIHOOD = ['almost-no-chance', 'very-unlikely', 'unlikely', 'even-chance', 'likely', 'very-likely', 'almost-certain'], CONFIDENCE = ['low', 'moderate', 'high'];
  const BANDS = [['almost-no-chance', 0, 5], ['very-unlikely', 5, 20], ['unlikely', 20, 45], ['even-chance', 45, 55], ['likely', 55, 80], ['very-likely', 80, 95], ['almost-certain', 95, 100]];
  const RANGE = Object.assign(Object.fromEntries(BANDS.map(([t, lo, hi]) => [t, [lo, hi]])), { 'almost-no-chance': [1, 5], 'almost-certain': [95, 99], 'cannot-judge': [0, 100] });
  const wordLo = x => BANDS.find(([, lo, hi]) => (lo <= x && x < hi) || (x === 100 && hi === 100))[0];
  const wordHi = x => BANDS.find(([, lo, hi]) => (lo < x && x <= hi) || (x === 0 && lo === 0))[0];
  function words([lo, hi]) { if (lo <= 1 && hi >= 99) return 'cannot judge'; const a = wordLo(lo), b = wordHi(hi); return a === b ? a : `${a} to ${b}`; }
  const both = (a, b) => [Math.max(0, a[0] + b[0] - 100), Math.min(a[1], b[1])];
  function wilson(k, n, z = 1.96) {
    const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.floor((c - h) * 1000) / 10, Math.ceil((c + h) * 1000) / 10];
  }
  function verdict([lo, hi], [blo, bhi]) { if (lo >= blo && hi <= bhi) return 'calibrated'; if (hi < blo) return 'over-confident'; if (lo > bhi) return 'under-confident'; return 'cannot judge yet'; }
  function corroborate(ranges, base = 50) {
    const post = rs => { const b = base / (100 - base); let o = b; for (const r of rs) o *= (r / (100 - r)) / b; return 100 * o / (1 + o); };
    return [Math.floor(post(ranges.map(r => r[0])) * 10) / 10, Math.ceil(post(ranges.map(r => r[1])) * 10) / 10];
  }
  const span = (l, lt) => (l in RANGE && (lt || l) in RANGE) ? [RANGE[l][0], RANGE[lt || l][1]] : null;
  const bandRank = w => LIKELIHOOD.indexOf(w);
  function latestAssessment(g) {
    const best = new Map();
    for (const a of g.labelled('Assessment')) for (const [, , c] of g.out(a, 'ASSESSES')) {
      if (!g.has(c, 'Claim')) continue; const at = g.p(a).at;
      if (!best.has(c) || at > best.get(c)[0]) best.set(c, [at, g.p(a).likelihood]);
    }
    return new Map([...best].map(([c, v]) => [c, v[1]]));
  }
  const sourcesOf = (g, c, t) => new Set(g.out(c, t).filter(e => g.has(e[2], 'Evidence')).flatMap(e => g.out(e[2], 'FROM').map(x => x[2])));
  function confidenceFromEvidence(g) {
    const out = new Map();
    for (const c of g.labelled('Claim')) {
      if (g.p(c).rule !== undefined && g.p(c).rule !== null) continue;
      const s = sourcesOf(g, c, 'SUPPORTED_BY'), k = sourcesOf(g, c, 'CONTRADICTED_BY');
      out.set(c, s.size >= 2 && !k.size ? 'high' : s.size > k.size ? 'moderate' : 'low');
    }
    return out;
  }
  function claimStatus(g) {
    const out = new Map();
    for (const c of g.labelled('Claim')) out.set(c, g.inc(c, 'CONFIRMS').length ? 'confirmed' : g.inc(c, 'REFUTES').length ? 'refuted' : 'open');
    return out;
  }
  function derivedRanges(g) {
    const out = new Map();
    for (const d of g.labelled('Claim')) {
      const rs = g.out(d, 'WAS_DERIVED_FROM').filter(e => g.has(e[2], 'Claim')).map(e => g.p(e[2]));
      if (!rs.length || rs.some(r => span(r.likelihood, r.likelihood_to) === null)) continue;
      let iv = span(rs[0].likelihood, rs[0].likelihood_to); for (const r of rs.slice(1)) iv = both(iv, span(r.likelihood, r.likelihood_to));
      const w = words(iv).split(' to ');
      out.set(d, { likelihood: w[0], likelihood_to: w[w.length - 1], low_pct: iv[0], high_pct: iv[1], confidence: rs.map(r => r.confidence).sort(byKey(x => CONFIDENCE.indexOf(x)))[0] });
    }
    return out;
  }
  function settled(g) {
    const out = new Map();
    for (const f of g.labelled('Finding')) for (const [, t, c] of g.out(f)) if ((t === 'CONFIRMS' || t === 'REFUTES') && g.has(c, 'Claim')) out.set(c, [t === 'CONFIRMS', g.p(f).recorded_at]);
    return out;
  }
  function calibration(g, beforeSettlement = true) {
    const S = settled(g), last = new Map();
    for (const a of g.labelled('Assessment')) for (const [, , c] of g.out(a, 'ASSESSES')) {
      if (!g.has(c, 'Claim')) continue;
      for (const [, , x] of g.out(a, 'BY')) {
        const w = g.p(a).likelihood, t = g.p(a).recorded_at, key = jcs([x, c]);
        if (!S.has(c) || (beforeSettlement && t >= S.get(c)[1])) continue;
        if (!last.has(key) || t > last.get(key)[2]) last.set(key, [x, c, t, w]);
      }
    }
    const tally = new Map();
    for (const [x, c, , w] of last.values()) { const key = jcs([x, w]), [n, k] = tally.get(key) || [0, 0]; tally.set(key, [n + 1, k + (S.get(c)[0] ? 1 : 0)]); }
    const out = new Map();
    for (const [key, [n, k]] of tally) { const [, w] = JSON.parse(key); out.set(key, { settled: n, came_true: k, range: wilson(k, n), verdict: verdict(wilson(k, n), RANGE[w]) }); }
    return out;
  }
  function reliability(g) {
    const S = settled(g), rec = new Map();
    for (const c of g.labelled('Claim')) if (S.has(c)) for (const s of sourcesOf(g, c, 'SUPPORTED_BY')) (rec.get(s) || rec.set(s, new Set()).get(s)).add(c);
    const out = new Map();
    for (const [s, cs] of rec) { const k = [...cs].filter(c => S.get(c)[0]).length; out.set(s, { backed: cs.size, came_true: k, range: wilson(k, cs.size) }); }
    return out;
  }
  function corroboration(g, oneVote = true) {
    const R = reliability(g), out = new Map();
    for (const c of g.labelled('Claim')) {
      if (g.p(c).rule !== 'rule:corroborate@1') continue;
      const rows = g.out(c, 'SUPPORTED_BY').filter(e => g.has(e[2], 'Evidence')).flatMap(e => g.out(e[2], 'FROM').map(x => x[2]));
      const srcs = oneVote ? [...new Set(rows)].sort() : rows;
      out.set(c, corroborate(srcs.map(s => R.get(s).range), g.p(c).base_pct));
    }
    return out;
  }
  function section20(g, sw) {
    const out = [], stored = new Map(g.labelled('Claim').map(c => [c, g.p(c)]));
    if (!stored.size) return out;
    const bands = new Set(g.labelled('LikelihoodBand').map(b => g.p(b).term));
    const used = new Set([...[...stored.values()].map(p => p.likelihood), ...[...stored.values()].filter(p => p.likelihood_to).map(p => p.likelihood_to), ...g.labelled('Assessment').map(a => g.p(a).likelihood)]);
    out.push(['§20: every likelihood is a band declared in the graph', [...used].every(u => bands.has(u))]);
    const la = latestAssessment(g);
    out.push(["§20: each claim's likelihood is its latest assessment", [...la].every(([c, v]) => stored.get(c).likelihood === v)]);
    const cf = confidenceFromEvidence(g);
    out.push(["§20: each claim's confidence is counted from its evidence", [...cf].every(([c, v]) => stored.get(c).confidence === v || (stored.get(c).rule !== undefined && stored.get(c).rule !== null))]);
    const st = claimStatus(g);
    out.push(["§20: each claim's status follows its confirmations and refutations", [...st].every(([c, v]) => stored.get(c).status === v)]);
    const dv = derivedRanges(g);
    if (dv.size) out.push(["§20: each derived claim's range and confidence equal rule:combine@1 on its inputs", [...dv].every(([d, v]) => Object.entries(v).every(([k, x]) => same(stored.get(d)[k], x) || (k === 'likelihood_to' && x === v.likelihood && (stored.get(d)[k] === undefined || stored.get(d)[k] === null))))]);
    const unassessed = [...stored].filter(([c, p]) => !la.has(c) && !p.rule);
    out.push(['§20: every claim not derived by a rule has an assessment', !unassessed.length]);
    if (g.labelled('Calibration').length) {
      const cal = calibration(g, !sw.has('before-settlement')), rows = new Map();
      for (const k of g.labelled('Calibration')) { const p = g.p(k); for (const [, , x] of g.out(k, 'OF')) rows.set(jcs([x, p.term]), [p.settled, p.came_true, [p.low_pct, p.high_pct], p.outcome]); }
      const keys = new Set([...rows.keys(), ...cal.keys()]);
      out.push(['§20: every calibration record equals rule:calibration@1 on the settled claims', [...keys].every(k => rows.has(k) && cal.has(k) && same(rows.get(k), [cal.get(k).settled, cal.get(k).came_true, cal.get(k).range, cal.get(k).verdict]))]);
    }
    const rel = reliability(g), rows = [...g.nodes.keys()].filter(s => g.p(s).backed_settled !== undefined && g.p(s).backed_settled !== null);
    if (rows.length) out.push(["§20: every source's reliability equals rule:source-reliability@1", rows.every(s => { const p = g.p(s), r = rel.get(s); return r && same([p.backed_settled, p.backed_true, [p.reliability_low_pct, p.reliability_high_pct]], [r.backed, r.came_true, r.range]); })]);
    const cor = corroboration(g, !sw.has('one-vote-per-source'));
    if (cor.size) out.push(["§20: every corroborated claim's range equals rule:corroborate@1, one vote per source", [...cor].every(([c, v]) => same([stored.get(c).low_pct, stored.get(c).high_pct], v))]);
    return out;
  }

  // §22 paths
  function pathSteps(g, pid) {
    if (!g.has(pid, 'Path')) return [];
    return g.out(pid, 'STEP').slice().sort(byKey(e => e[3].seq || 0)).map(e => ({ seq: e[3].seq, id: e[2], altitude: g.p(e[2]).altitude, labels: [...g.nodes.get(e[2])[0]].sort() }));
  }
  function viewAt(g, pid, level, seen) {
    seen = new Set([...(seen || []), pid]); const out = [];
    for (const r of pathSteps(g, pid)) { if (r.labels.includes('Path') && (r.altitude || 0) > level && !seen.has(r.id)) out.push(...viewAt(g, r.id, level, seen)); else out.push(r.id); }
    return out;
  }
  function below(g, top, depth = 8) {
    const seen = new Set(); let frontier = [top];
    for (let i = 0; i < depth; i++) { frontier = frontier.flatMap(f => g.out(f, 'STEP').map(e => e[2])).filter(x => !seen.has(x)); frontier.forEach(x => seen.add(x)); if (!frontier.length) break; }
    return seen;
  }
  function pathsRules(g) {
    const out = [], paths = g.labelled('Path'); if (!paths.length) return out;
    out.push(['§22 rule 1: altitude falls at every step into a path — no path contains itself', !paths.some(s => g.out(s, 'STEP').some(e => g.has(e[2], 'Path') && (g.p(e[2]).altitude || 0) >= (g.p(s).altitude || 0)))]);
    out.push(["§22 rule 2: each path's steps are numbered 1 to n", paths.every(p => { const s = g.out(p, 'STEP').map(e => e[3].seq).sort((a, b) => a - b); return s.every((x, i) => x === i + 1); })]);
    out.push(['§22 rule 3: every path grounds out in facts', paths.every(p => { const v = viewAt(g, p, 0); return v.length && !v.some(x => g.nodes.has(x) && (g.nodes.get(x)[0].has('Path') || g.nodes.get(x)[0].has('Concept'))); })]);
    out.push(['§22 rule 4: a path that declares an order keeps it', paths.every(p => { const o = g.p(p).ordered_by; if (!o) return true; const f = viewAt(g, p, 0).map(x => g.p(x)[o]).filter(v => v !== undefined && v !== null); return f.every((a, i) => i === 0 || !(f[i - 1] > a)); })]);
    return out;
  }

  // §15 lens rules — the simple shape, evaluated without an engine
  function lensBuckets(g, rule) {
    const m = /^\s*MATCH \((\w+):(\w+)\) RETURN \1\.id AS id, CASE ([\s\S]*) ELSE '([^']*)' END AS grp\s*$/.exec(rule || '');
    if (!m) return null;
    const [, v, label, whens, other] = m, arms = [...whens.matchAll(/WHEN (.*?) THEN '([^']*)'\s*/g)].map(a => [a[1], a[2]]);
    if (arms.map(([c, b]) => `WHEN ${c} THEN '${b}'`).join(' ') !== whens.trim().replace(/\s+/g, ' ')) return null;
    const test = (cond, p) => {
      for (const part of cond.split(/\s+AND\s+/)) {
        const t = new RegExp(`^${v}\\.(\\w+)\\s*(<=|>=|<>|=|<|>)\\s*('([^']*)'|-?\\d+(?:\\.\\d+)?)$`).exec(part.trim());
        if (!t) throw new Error('needs an engine');
        const a = p[t[1]], b = t[4] !== undefined ? t[4] : Number(t[3]), op = t[2];
        if (a === undefined || a === null) return false;
        if (['<', '>', '<=', '>='].includes(op) && typeof a !== typeof b) throw new Error('needs an engine');
        if (!({ '=': a === b, '<>': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b })[op]) return false;
      }
      return true;
    };
    try { const out = {}; for (const i of g.labelled(label)) { const hit = arms.find(([c]) => test(c, g.p(i))); out[i] = hit ? hit[1] : other; } return out; }
    catch { return null; }
  }

  // §23 judgements
  const JUDGEMENT_EDGES = ['RESTS_ON', 'ASSUMES', 'UNDER'];
  function resolve(w, ref) { const g = w[ref.graph]; if (!g || !g.nodes.has(ref.ref)) return [null, new Set(), false]; return [g.p(ref.ref), new Set(g.nodes.get(ref.ref)[0]), g.inc(ref.ref, 'SUPERSEDES').length > 0]; }
  function basis(w, jg, d) { const g = w[jg]; return g.out(d).filter(e => g.has(e[2], 'Ref')).map(e => ({ ty: e[1], e: e[3], ref: g.p(e[2]).ref, graph: g.p(e[2]).graph, rid: e[2] })); }
  function currentDecisions(w, jg) { const g = w[jg]; return g.labelled('Decision').filter(d => !g.inc(d, 'SUPERSEDES').some(e => g.has(e[0], 'Decision'))).sort(); }
  function judgementHash(w, jg, d) {
    const g = w[jg], p = g.p(d), dec = {};
    for (const [k, v] of Object.entries(p)) if (k !== 'content_hash' && k !== 'review') dec[k] = norm(v);
    const edges = g.out(d).map(([, t, x, e]) => { const o = {}; for (const k of Object.keys(e).sort()) o[k] = norm(e[k]); return [t, x, o]; }).sort(byKey(jcs));
    return hash16({ decision: dec, edges });
  }
  function review(w, jg, sw = new Set()) {
    const out = {};
    for (const d of currentDecisions(w, jg)) {
      const why = new Set();
      for (const b of basis(w, jg, d)) {
        if (!JUDGEMENT_EDGES.includes(b.ty)) continue;
        const [p, , sup] = resolve(w, b); if (p === null) continue;
        if (b.ty === 'RESTS_ON' && b.e.lens) {
          if (sw.has('lens-pins')) continue;
          const lg = w[b.graph], lz = lg.labelled('Lens').find(x => x === b.e.lens), got = lz ? lensBuckets(lg, lg.p(lz).rule_gql) : null;
          if (got === null) why.add('needs-engine'); else if (got[b.ref] !== b.e.bucket) why.add('basis-moved');
        } else if (b.ty === 'RESTS_ON' && (sup || basisHash(p, b.e.reads) !== b.e.hash)) why.add('basis-moved');
        if (b.ty === 'ASSUMES' && (p.status === 'refuted' || (!sw.has('assumption-bands') && bandRank(p.likelihood) < bandRank(b.e.likelihood_then)))) why.add('assumption-weakened');
        if (b.ty === 'UNDER' && sup) why.add('shape-changed');
      }
      out[d] = [...why].sort();
    }
    return out;
  }
  function whyLayer(w, jg, dg, top, level, sw = new Set()) {
    const g = w[dg], seen = new Set([top, ...viewAt(g, top, level)]);
    if (!sw.has('why-folded')) below(g, top).forEach(x => seen.add(x));
    const hits = new Set();
    for (const d of currentDecisions(w, jg)) if (basis(w, jg, d).some(b => ['RESTS_ON', 'ASSUMES'].includes(b.ty) && b.graph === dg && seen.has(b.ref))) hits.add(d);
    return [...hits].sort();
  }
  function judgementsRules(w, jg) {
    const g = w[jg], out = [], ds = g.labelled('Decision');
    out.push(['§23 rule 1: every judgement is decided by a person, never a model', ds.every(d => { const who = basis(w, jg, d).filter(b => b.ty === 'DECIDED_BY').map(b => resolve(w, b)[1]); return who.length && who.every(l => l.has('Person')); })]);
    out.push(['§23 rule 2: every basis pin resolves, says what it read (or which lens bucket), and was read no later than the decision', ds.every(d => basis(w, jg, d).filter(b => b.ty === 'RESTS_ON').every(b => { const e = b.e, said = (e.hash && e.reads) || (e.lens && e.bucket); return resolve(w, b)[0] !== null && said && e.as_of && !(e.as_of > g.p(d).at); }))]);
    out.push(['§23 rule 3: every assumption is a claim (§20), never a fact', ds.every(d => basis(w, jg, d).filter(b => b.ty === 'ASSUMES').every(b => resolve(w, b)[1].has('Claim')))]);
    const rv = review(w, jg);
    out.push(['§23 rule 4: a stored review equals rule:judgement-review@1', ds.every(d => { const r = g.p(d).review; return r === undefined || r === null || r === ((rv[d] || []).join(', ') || 'none'); })]);
    out.push(['§23 rule 5: nothing in a data graph links into the judgement graph — judgements stay out of view', !Object.entries(w).some(([x, G]) => x !== jg && G.labelled('Ref').some(r => G.p(r).graph === jg))]);
    out.push(['§23 rule 6: every proposal names the activity and the model that generated it', g.labelled('Proposal').every(p => { const ms = g.out(p, 'WAS_GENERATED_BY').filter(e => g.has(e[2], 'Activity')).flatMap(e => g.out(e[2], 'ASSOCIATED_WITH').filter(x => g.has(x[2], 'Ref')).map(x => g.p(x[2]))); return ms.length && ms.every(m => resolve(w, m)[1].has('Model')); })]);
    out.push(['§23 rule 7: no judgement is edited — each content hash, covering its pins, still matches (rule:judgement-hash@1)', ds.every(d => g.p(d).content_hash === judgementHash(w, jg, d))]);
    return out;
  }

  // §24 servings
  function mayServe(kind, cls, cond, matrix) { const v = (matrix[kind] || {})[cls]; return v === 'yes' || (v === 'conditional' && !!cond); }
  function servedRules(w, jg, matrix) {
    const g = w[jg], out = [];
    if (!g.labelled('Serving').length && !g.labelled('Proposal').length) return out;
    const served = new Map();
    for (const p of g.labelled('Proposal')) for (const [, , s] of g.out(p, 'USED')) if (g.has(s, 'Serving')) for (const [, , x, e] of g.out(s, 'SERVED')) (served.get(p) || served.set(p, new Map()).get(p)).set(x, e);
    out.push(['§24 H3 rule 1: every pin of a proposal was served to its model — same item, same properties, same hash, same time', g.labelled('Proposal').every(p => g.out(p, 'RESTS_ON').filter(e => g.has(e[2], 'Ref')).every(([, , x, e]) => { const s = (served.get(p) || new Map()).get(x); return s && ['reads', 'hash', 'as_of'].every(k => same(s[k], e[k])); }))]);
    out.push(['§24 H3 rule 2: no serving crossed its classification — the consumer was allowed every item served', g.labelled('Serving').every(s => g.out(s, 'SERVED').every(([, , , e]) => mayServe(g.p(s).consumer_kind, e.classification, g.p(s).conditions_met, matrix)))]);
    out.push(['§24 H3 rule 4: every proposal a model generated used a serving — it drafted from what it was shown', g.labelled('Proposal').every(p => {
      const ms = g.out(p, 'WAS_GENERATED_BY').filter(e => g.has(e[2], 'Activity')).flatMap(e => g.out(e[2], 'ASSOCIATED_WITH').filter(x => g.has(x[2], 'Ref')).map(x => g.p(x[2])));
      return !ms.some(m => resolve(w, m)[1].has('Model')) || g.out(p, 'USED').some(e => g.has(e[2], 'Serving'));
    })]);
    return out;
  }

  // §23 applies to a graph that declares the judgement basis (RESTS_ON), or holds proposals or servings — as graph_rules.py
  const isJudgementGraph = g => g.labelled('ElementType').some(t => g.p(t).name === 'RESTS_ON') || g.labelled('Proposal').length > 0 || g.labelled('Serving').length > 0;
  // §5 drafts (6 Oct 2026), as graph_rules.py: a graph with no schema — none of its own, none named — has its kinds and types worked out from the data
  const isDraft = (w, name) => !w[name].labelled('ElementType').length && !(w.__named || {})[name];
  const drafted = g => [[...new Set([...g.nodes.values()].flatMap(([l]) => [...l].filter(x => !SPEC_NODES.includes(x))))].sort(), [...new Set(g.edges.map(e => e[1]))].sort()];
  function lev(a, b) {
    const row = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++) { let prev = row[0]; row[0] = i; for (let j = 1; j <= b.length; j++) { const t = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] !== b[j - 1] ? 1 : 0)); prev = t; } }
    return row[b.length];
  }
  const nearDuplicates = names => { const n = x => x.replace(/_/g, '').toLowerCase(), out = [];
    names.forEach((a, i) => names.slice(i + 1).forEach(b => { if (lev(n(a), n(b)) <= (Math.min(n(a).length, n(b).length) >= 8 ? 2 : 1)) out.push([a, b]); })); return out; };
  function check(w, name, matrix, sw = new Set()) {
    const g = w[name], shared = g.labelled('ElementType').length ? undefined : schemaFor(w, name)[1];
    const [kinds, types_] = drafted(g);
    const t5 = isDraft(w, name) ? ["§5: a draft's kinds and relationship types hold no near-duplicates", !nearDuplicates(kinds).length && !nearDuplicates(types_).length]
                                : ['§5: every element has a declared type', typed(g, shared)];
    let back; try { back = projectsBack(g, name); } catch (e) { if (!/^refused: §18/.test(String(e && e.message))) throw e; back = false; }
    let out = [t5, ['§18: the flat projection rebuilds the graph', back]];
    out = out.concat(section20(g, sw), pathsRules(g));
    if (isJudgementGraph(g)) out = out.concat(judgementsRules(w, name), matrix ? servedRules(w, name, matrix) : []);
    return out;
  }

  // ── §24 H1 the dialect linter, and change sets ──────────────────────────────────────────────────
  const blank = text => text.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length)).replace(/'(?:[^'\\]|\\.)*'/g, m => "'" + ' '.repeat(m.length - 2) + "'");
  // Each [ that opens a list rather than a relationship or an index — not straight after a word, -, ], >, ) or ' — with the
  // whitespace before it, as graph_spec.lint finds them; written without a regex lookbehind, which iOS before 16.4 cannot run.
  function listStarts(src) {
    const out = [], after = new Set(['-', ']', '>', ')', "'"]), word = c => /\w/.test(c), space = c => /\s/.test(c);
    let from = 0;
    for (let i = src.indexOf('[', from); i !== -1; i = src.indexOf('[', from)) {
      let p = i; while (p > from && space(src[p - 1])) p--;
      const ok = q => q === 0 || !(word(src[q - 1]) || after.has(src[q - 1]));
      const start = ok(p) ? p : p < i ? p + 1 : -1;
      if (start !== -1) { out.push({ index: start, 0: src.slice(start, i + 1) }); from = i + 1; } else from = i + 1;
    }
    return out;
  }
  function closeAt(src, i) { let depth = 0; for (let j = i; j < src.length; j++) { depth += src[j] === '(' ? 1 : src[j] === ')' ? -1 : 0; if (depth === 0) return j; } return src.length - 1; }
  function lint(text) {
    const src = blank(text), out = [], add = (trap, pos) => out.push({ trap, line: src.slice(0, pos).split('\n').length });
    for (const m of src.matchAll(/[:.({,]\s*([A-Za-z_]\w*)\b/g)) {   // a word after : . ( { or , — the punctuation is matched, not looked behind at, for iOS before 16.4
      const w = m[1], end = m.index + m[0].length;
      if (['for', 'groups', 'group'].includes(w.toLowerCase()) && !/^\s*BY\b/i.test(src.slice(end))) add('reserved word', m.index + m[0].indexOf(w));
    }
    for (const m of src.matchAll(/\(\s*(on)\s*[:)]/g)) add('reserved word', m.index);
    for (const m of src.matchAll(/\bZONED\s+DATETIME\b/gi)) add('zoned datetime', m.index);
    for (const m of src.matchAll(/\b(sum|count|avg|min|max|collect)\s*\(/gi)) {
      const end = closeAt(src, m.index + m[0].length - 1), after = src.slice(end + 1, end + 60), before = src.slice(Math.max(0, m.index - 60), m.index);
      const right = /^\s*(<>|<=|>=|[<>=+\-*/%])\s*([\w.]+)/.exec(after), left = /([\w.]+)\s*(<>|<=|>=|[<>=+\-*/%])\s*$/.exec(before);
      if ((right && right[2].includes('.')) || (left && left[1].includes('.'))) add('aggregate mixed with a value', m.index);
    }
    for (const m of src.matchAll(/\bMATCH\b([\s\S]*?)(?=\b(?:WHERE|RETURN|WITH|INSERT|SET|MATCH|OPTIONAL|ORDER|DELETE|CALL|LIMIT)\b|$)/gi)) {
      for (const chain of m[1].split(/,(?![^()[\]{}]*[)\]}])/)) { const names = [...chain.matchAll(/\(\s*([A-Za-z_]\w*)/g)].map(x => x[1]); if (names.length !== new Set(names).size) add('pattern returns to a bound variable', m.index + 5); }
    }
    for (const m of src.matchAll(/\bSET\b/gi)) if (/\bINSERT\b/i.test(src.slice(m.index + m[0].length))) add('SET before INSERT', m.index);
    for (const m of listStarts(src)) {
      const end = src.indexOf(']', m.index + m[0].length), body = src.slice(m.index + m[0].length, end).replace(/\{[^{}]*\}/g, '');
      if (/[A-Za-z_]\w*\.(?!id\b)[A-Za-z_]/.test(body) && !body.trimStart().startsWith(':')) add('list literal with values that may be null', m.index);
    }
    for (const m of src.matchAll(/[Xx]'/g)) if (!m.index || !/\w/.test(src[m.index - 1])) add('byte literal', m.index);   // not straight after a word
    if (/^\s*\/\/\s*graph:/.test(text)) { const e = checkSyntax(text); if (e) out.push({ trap: 'outside the document profile', line: e.line }); }
    return out.sort(byKey(f => f.line));
  }
  const MODEL_MAY_ADD = new Set(['Claim', 'Assessment', 'Evidence', 'Proposal', 'Option', 'Activity', 'Ref']);
  const MODEL_MAY_LINK = new Set(['ABOUT', 'ASSESSES', 'BY', 'SUPPORTED_BY', 'CONTRADICTED_BY', 'FROM', 'CONSIDERED', 'WAS_GENERATED_BY', 'ASSOCIATED_WITH', 'CHALLENGED_BY', 'USED', 'RESTS_ON', 'WAS_DERIVED_FROM']);
  function changesetHeader(block) {
    const first = block.split('\n').find(l => l.trim()) || '';
    const m = /^\s*\/\/\s*graph:\s*(\S+)\s*·\s*CHANGE SET\s+(\S+)\s*·\s*against\s+([0-9a-f]{16})\s*·\s*by\s+(\S+)/.exec(first);
    return m ? { graph: m[1], id: m[2], against: m[3], by: m[4] } : null;
  }
  const stateOf = g => {
    const pj = p => { const o = {}; for (const k of Object.keys(p).sort()) o[k] = norm(p[k]); return JSON.stringify(o); };
    return [new Map([...g.nodes].map(([i, [l, p]]) => [i, [[...l].sort().join(':'), pj(p)]])), g.edges.map(([s, t, d, p]) => JSON.stringify([s, t, d, pj(p)]))];
  };
  function refreshSection20(store, name) {
    const g = worldFromStore(store)[name], G = store.graph(name), out = [], keyOf = new Map([...G.nodes].map(([k, n]) => [n.props.id, k]));
    for (const [key, rule] of [['likelihood', latestAssessment(g)], ['confidence', confidenceFromEvidence(g)], ['status', claimStatus(g)]]) {
      for (const [c, v] of rule) { const p = G.nodes.get(keyOf.get(c)).props; if (p[key] !== v && !(key === 'confidence' && p.rule)) { out.push([c, key, p[key] === undefined ? null : p[key], v]); p[key] = v; } }
    }
    return out;
  }
  function checkChangeset(base, block, matrix, sw = new Set()) {
    const res = [], add = (l, ok) => res.push([l, !!ok]);
    const h = changesetHeader(block);
    add('the change set names its graph, its id, the state it was made against, and its author', h);
    if (!h) return { results: res, header: null, after: null };
    add('it passes the dialect linter (§24 H1)', !lint(block).length);
    const st = new Store(); base.forEach(b => st.apply(b));
    if (!(h.graph in st.graphs)) { add(`its graph ${h.graph} is one of the base's`, false); return { results: res, header: h, after: null }; }
    let w = worldFromStore(st); const now = canon(w[h.graph]).slice(0, 16);
    add('it was made against the graph as it stands', h.against === now);
    const who = Object.values(w).filter(g => g.nodes.has(h.by)).map(g => g.nodes.get(h.by)[0]);
    const kind = who.some(l => l.has('Model')) ? 'Model' : who.some(l => l.has('Person')) ? 'Person' : null;
    add(`its author ${h.by} is a known person or model`, kind);
    const before = stateOf(w[h.graph]);
    try { st.apply(block); } catch (e) { if (!(e instanceof ProfileError)) throw e; add('it loads', false); return { results: res, header: h, after: null }; }
    const after = stateOf(worldFromStore(st)[h.graph]);
    const count = a => a.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map()), bc = count(before[1]), ac = count(after[1]);
    const gone = [...before[0].keys()].some(i => !after[0].has(i)) || [...bc].some(([e, n]) => (ac.get(e) || 0) < n);
    const changed = [...before[0]].some(([i, v]) => after[0].has(i) && (after[0].get(i)[0] !== v[0] || after[0].get(i)[1] !== v[1]));
    if (!sw.has('additions-only')) add('it only adds — nothing removed, nothing already there changed (§12)', !gone && !changed);
    const newNodes = [...after[0]].filter(([i]) => !before[0].has(i));
    h.refreshes = refreshSection20(st, h.graph);
    const newEdges = [...ac].filter(([e, n]) => n > (bc.get(e) || 0)).map(([e]) => JSON.parse(e));
    w = worldFromStore(st); const g = w[h.graph];
    if (kind === 'Model' && !sw.has('model-may-add')) {
      add('a model adds only claims, assessments, evidence, proposals and options (§24 rule 2)', newNodes.every(([, [l]]) => l.split(':').some(x => MODEL_MAY_ADD.has(x))) && newEdges.every(e => MODEL_MAY_LINK.has(e[1])));
      const by = newNodes.filter(([, [l]]) => l.split(':').includes('Assessment')).flatMap(([i]) => g.out(i, 'BY').map(e => e[2]));
      add("a model's assessments are its own", by.every(x => x === h.by));
    }
    for (const [l, ok] of check(w, h.graph, matrix)) add('after it, ' + l, ok);
    return { results: res, header: h, after: canon(g).slice(0, 16) };
  }

  // ── §21 joins (graph_spec.py: normalise, validate, union, merge3, finish) ──────────────────────────
  // Python's printing decides two things a join's result depends on — the order it walks relationships in, and the text of a
  // nondeterminism warning — so those few places reproduce it (pyrepr). Identifiers use vtext, which is the same everywhere.
  const ABSENT = { absent: true };
  function pystrQ(s) {
    const q = s.includes("'") && !s.includes('"') ? '"' : "'";
    return q + s.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), '\\' + q).replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
      .replace(/[^ -~\u0080-￿]/g, c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')) + q;
  }
  function pynum(v) { if (Number.isInteger(v)) return String(v); const r = String(v), m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(r); return m ? `${m[1]}e${m[2]}${m[3].padStart(2, '0')}` : r; }
  function pyrepr(v) {
    if (v === null || v === undefined) return 'None';
    if (v === true) return 'True'; if (v === false) return 'False';
    if (typeof v === 'number') return pynum(v);
    if (typeof v === 'string') return pystrQ(v);
    if (isTime(v)) {
      if (v.kind === 'date') return `datetime.date(${+v.s.slice(0, 4)}, ${+v.s.slice(5, 7)}, ${+v.s.slice(8, 10)})`;
      const [d, t] = v.s.split('T'), [hh, mm, ssf] = t.split(':'), [ss, us] = ssf.split('.'), parts = [+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10), +hh, +mm];
      if (+ss || +(us || 0)) parts.push(+ss); if (+(us || 0)) parts.push(+us); return `datetime.datetime(${parts.join(', ')})`;
    }
    if (Array.isArray(v)) return '(' + v.map(pyrepr).join(', ') + (v.length === 1 ? ',' : '') + ')';
    if (v.__list) return '[' + v.__list.map(pyrepr).join(', ') + ']';
    return '{' + Object.entries(v).map(([k, x]) => pystrQ(k) + ': ' + pyrepr(x)).join(', ') + '}';
  }
  const pystr = v => typeof v === 'string' ? v : isTime(v) ? (v.kind === 'date' ? v.s : v.s.replace('T', ' ')) : pyrepr(v);
  const pyeq = (a, b) => a === b || ((typeof a === 'number' || typeof a === 'boolean') && (typeof b === 'number' || typeof b === 'boolean') && Number(a) === Number(b)) || (isTime(a) && isTime(b) && same(a, b));
  const pyround = x => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };
  const vtext = v => isTime(v) ? v.s : typeof v === 'string' ? v : jcs(v);
  const identStr = k => k[3].filter(x => x !== null && x !== undefined).map(vtext).join(';');
  const short = d => d.split(':')[1];
  const keystr = k => pyrepr(k);
  const combos = a => { const o = []; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) o.push([a[i], a[j]]); return o; };
  function groupBy(entries) {   // [[doc, value]] -> [[value, [docs]]], values compared as Python compares dict keys
    const out = [];
    for (const [d, v] of entries) { const hit = out.find(([x]) => pyeq(x, v)); if (hit) hit[1].push(d); else out.push([v, [d]]); }
    return out;
  }
  const refinesV = (a, b) => { const m = v => typeof v === 'string' && /^\d{4}(-\d\d){0,2}[?~%]?$/.test(v) ? v.replace(/[?~%]+$/, '') : null; return m(a) !== null && m(b) !== null && m(a).length > m(b).length && m(a).startsWith(m(b)); };
  const compatibleV = (a, b) => pyeq(a, b) || refinesV(a, b) || refinesV(b, a);

  function parseDoc(block) {
    const m = /document (\S+) · schema (\S+) · as of (\d{4}-\d\d-\d\d)(?: · revision of (\S+))?/.exec(block);
    const st = new Store(), g = st.apply(block), G = st.graph(g), byk = new Map([...G.nodes].map(([k, n]) => [k, n.props.id]));
    const nodes = new Map([...G.nodes.values()].map(n => [n.props.id, { labels: new Set(n.labels), props: Object.assign({}, n.props) }]));
    return { id: m[1], schema: m[2], as_of: new GTime('date', m[3]), revision_of: m[4] || null, nodes, raw_edges: G.edges.map(([a, t, b, p]) => [byk.get(a), t, byk.get(b), Object.assign({}, p)]) };
  }
  function edgesMap(list) { const m = new Map(); for (const [k, p] of list) m.set(keystr(k), { key: k, props: p }); return m; }
  const ekey = (f, ty, t, p, C) => [f, ty, t, (C.edge_keys[ty] || []).map(a => p[a] === undefined ? null : p[a])];
  function rawProps(doc) { const o = new Map(); for (const [nid, n] of doc.nodes) for (const [k, v] of Object.entries(n.props)) o.set(nid + '\u0000' + k, v); return o; }
  function normalise(doc, log, C, base) {
    for (const [old, nu] of Object.entries(C.id_map)) if (doc.nodes.has(old)) { const n = doc.nodes.get(old); doc.nodes.delete(old); n.props.id = nu; doc.nodes.set(nu, n); log.push(['id', old, 'id', '', 'identity restated', 'a declared id map: one thing under two ids']); }
    doc.raw_edges = doc.raw_edges.map(([f, ty, t, p]) => [C.id_map[f] ?? f, ty, C.id_map[t] ?? t, p]);
    for (const [nid, n] of doc.nodes) {
      for (const [k, [k2, factor]] of Object.entries(C.maps[doc.schema] || {})) if (k in n.props) { const v = n.props[k]; delete n.props[k]; n.props[k2] = pyround(v * factor); log.push(['unit', nid, k2, '', 'unit restated', '—']); }
      for (const [k, ty] of Object.entries(C.time)) if (k in n.props) {
        const v = n.props[k]; delete n.props[k];
        const as_of = base && base._raw && base._raw.has(nid + '\u0000' + k) && pyeq(base._raw.get(nid + '\u0000' + k), v) ? base.as_of : doc.as_of;
        doc.raw_edges.push([nid, ty, v, { as_of }]); log.push(['time', nid, ty, '', 'restated over time', '—']);
      }
    }
    doc.raw_edges.forEach(([f, ty, t, p], i) => {
      for (const vm of C.value_maps) if (ty === vm.type && p[vm.attribute] !== undefined && Object.prototype.hasOwnProperty.call(vm.map, p[vm.attribute])) {
        const old = p[vm.attribute]; p = Object.assign({}, p, { [vm.attribute]: vm.map[old] }); doc.raw_edges[i] = [f, ty, t, p];
        log.push(['vocab', f, `${ty} ${vm.attribute}`, '', 'restated — a declared vocabulary map', '—']);
      }
    });
    doc.edges = edgesMap(doc.raw_edges.map(([f, ty, t, p]) => [ekey(f, ty, t, p, C), p]));
    return doc;
  }

  // the named rules a configuration refers to (graph_spec.py RULES) — what checks constraints with no engine
  const nodeP = (nodes, id) => (nodes.get(id) || { props: {} }).props;
  function flowParents(nodes, edges) { const m = new Map(); for (const { key: k } of edges.values()) if (k[1] === 'DETAILED_IN' && nodes.has(k[2])) m.set(nodeP(nodes, k[2]).flow, k[0]); return m; }
  function ancestors(state, nodes, edges) { const par = flowParents(nodes, edges), out = []; let f = nodeP(nodes, state).flow; while (par.has(f) && !out.includes(par.get(f)) && par.get(f) !== state) { out.push(par.get(f)); f = nodeP(nodes, par.get(f)).flow; } return out; }
  function elseOver(nodes, edges, above) {
    const out = [];
    for (const { key: k, props: p } of edges.values()) if (k[1] === 'TRANSITION' && p.guard === 'else') {
      const ab = above(k[0]), pe = [...edges.values()].filter(({ key: e, props: q }) => ab.includes(e[0]) && e[1] === 'TRANSITION' && q.event === p.event).map(e => e.key);
      if (pe.length) out.push({ edges: [k].concat(pe.sort(byKey(keystr))) });
    }
    return out;
  }
  const RULES = {
    'repaid-after-drawn': (nodes, edges) => [...edges.values()].filter(({ key: k }) => k[1] === 'REPAYS' && 'at' in nodeP(nodes, k[0]) && 'drawn_at' in nodeP(nodes, k[2]) && nodeP(nodes, k[0]).at < nodeP(nodes, k[2]).drawn_at).map(({ key: k }) => ({ slots: [[k[0], 'at'], [k[2], 'drawn_at']] })),
    'one-start': (nodes) => { const by = new Map(); for (const [nid, n] of nodes) if (n.props.initial) { const f = keystr(n.props.flow ?? null); (by.get(f) || by.set(f, []).get(f)).push(nid); } return [...by.values()].filter(xs => xs.length > 1).map(xs => ({ slots: xs.slice().sort().map(x => [x, 'initial']) })); },
    'final-is-final': (nodes, edges) => [...edges.values()].filter(({ key: k }) => k[1] === 'TRANSITION' && nodeP(nodes, k[0]).final).map(({ key: k }) => ({ slots: [[k[0], 'final']], edges: [k] })),
    'else-over-ancestor': (nodes, edges) => elseOver(nodes, edges, s => ancestors(s, nodes, edges)),
    'else-over-parent': (nodes, edges) => { const par = flowParents(nodes, edges); return elseOver(nodes, edges, s => par.has(nodeP(nodes, s).flow) ? [par.get(nodeP(nodes, s).flow)] : []); },
    'subflow-needs-done': (nodes, edges) => {
      const out = [];
      for (const [fl, p] of flowParents(nodes, edges)) {
        const ends = [...edges.values()].filter(({ key: k }) => k[1] === 'TRANSITION' && nodeP(nodes, k[2]).flow === fl && nodeP(nodes, k[2]).final).map(e => e.key);
        if (ends.length && ![...edges.values()].some(({ key: k, props }) => k[0] === p && props.event === 'done')) out.push({ edges: ends });
      }
      return out;
    },
    'subflow-nesting-acyclic': (nodes, edges) => {
      const into = new Map();
      for (const { key: k } of edges.values()) if (k[1] === 'DETAILED_IN' && nodes.has(k[0]) && nodes.has(k[2])) { const a = nodeP(nodes, k[0]).flow, b = nodeP(nodes, k[2]).flow; (into.get(a) || into.set(a, new Set()).get(a)).add(b); }
      let loop = null;
      outer: for (const start of [...into.keys()].sort(byKey(x => pystr(x)))) {
        const stack = [[start, [start]]];
        while (stack.length) { const [f, path] = stack.pop(); for (const g of [...(into.get(f) || [])].sort(byKey(x => pystr(x)))) { if (g === start) { loop = path.concat([g]); break outer; } if (!path.includes(g)) stack.push([g, path.concat([g])]); } }
      }
      if (!loop) return [];
      const pairs = new Set(loop.slice(0, -1).map((a, i) => a + '\u0000' + loop[i + 1]));
      return [{ edges: [...edges.values()].map(e => e.key).filter(k => k[1] === 'DETAILED_IN' && nodes.has(k[0]) && nodes.has(k[2]) && pairs.has(nodeP(nodes, k[0]).flow + '\u0000' + nodeP(nodes, k[2]).flow)).sort(byKey(keystr)) }];
    },
  };
  function guardHolds(g, ctx) {   // guards as the spec writes them: comparisons joined by and / or / not
    const toks = g.match(/\s*(>=|<=|==|!=|=|<|>|\(|\)|[A-Za-z_]\w*|-?\d+(?:\.\d+)?)/g).map(t => t.trim()); let i = 0;
    const truthy = v => !(v === false || v === 0 || v === null || v === undefined || v === '');
    const atom = () => { const t = toks[i++]; if (t === '(') { const v = or(); i++; return v; } if (t === 'not') return !truthy(cmp()); if (t === 'True' || t === 'true') return true; if (t === 'False' || t === 'false') return false; if (/^-?\d/.test(t)) return Number(t); if (!(t in ctx)) throw new Error(`name '${t}' is not defined`); return ctx[t]; };
    const cmp = () => { let a = atom(); while (['=', '==', '!=', '<', '>', '<=', '>='].includes(toks[i])) { const op = toks[i++], b = atom(); a = { '=': pyeq(a, b), '==': pyeq(a, b), '!=': !pyeq(a, b), '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b }[op]; } return a; };
    const and = () => { let a = cmp(); while (toks[i] === 'and') { i++; const b = cmp(); a = truthy(a) ? b : a; } return a; };
    const or = () => { let a = and(); while (toks[i] === 'or') { i++; const b = and(); a = truthy(a) ? a : b; } return a; };
    return truthy(or());
  }
  function cycles(edges, types) {
    const found = new Map();
    for (const ty of types) {
      const E = [...edges.values()].map(e => e.key).filter(k => k[1] === ty).sort(byKey(keystr));
      for (const e of E) {
        const stack = [[e[2], [e]]];
        while (stack.length) {
          const [node, path] = stack.pop();
          if (pyeq(node, e[0])) { const c = path.slice().sort(byKey(keystr)); found.set(keystr(c), c); break; }
          for (const x of E) if (pyeq(x[0], node) && !path.some(p => keystr(p) === keystr(x)) && path.length < E.length) stack.push([x[2], path.concat([x])]);
        }
      }
    }
    return [...found.entries()].sort(byKey(([k]) => k)).map(([, c]) => c);
  }
  function breaches(nodes, edges, C, checks) {
    let out = [];
    if (checks.includes('cycles')) out = out.concat(cycles(edges, C.acyclic).map(c => ({ kind: 'cycle', why: 'a cycle', edges: c, slots: [] })));
    if (checks.includes('cardinality')) for (const r of C.at_most_one) {
      const g = new Map();
      for (const { key: e } of edges.values()) if (e[1] === r.type) { const a = r.side === 'in' ? e[2] : e[0], ak = keystr(a); (g.get(ak) || g.set(ak, [a, []]).get(ak))[1].push(e); }
      for (const [, [, es]] of [...g.entries()].sort(byKey(([k]) => k))) if (es.length > 1) out.push({ kind: 'too-many', why: r.rule, edges: es.sort(byKey(keystr)), slots: [] });
    }
    if (checks.includes('constraints')) for (const [name, fn] of C.constraints) {
      if (fn === null) throw new Error(`the constraint '${name}' is written in GQL with no named twin — it needs an engine`);
      out = out.concat(fn(nodes, edges).map(b => ({ kind: 'constraint', why: name, edges: b.edges || [], slots: b.slots || [] })));
    }
    if (checks.includes('determinism') && Object.keys(C.contexts).length) {
      const by = new Map();
      for (const { key: e, props: p } of edges.values()) if (e[1] === 'TRANSITION') { const k = keystr([e[0], p.event ?? null]); (by.get(k) || by.set(k, [e[0], p.event ?? null, []]).get(k))[2].push(e); }
      const items = [...by.values()].sort(byKey(([s, ev, es]) => pyrepr([[s, ev], { __list: es }])));
      for (const [, ev, es] of items) for (const ctx of (C.contexts[ev] || [{}])) {
        const P = e => edges.get(keystr(e)).props;
        const plain = es.filter(e => P(e).guard !== undefined && P(e).guard !== null && P(e).guard !== 'else' && guardHolds(P(e).guard, ctx)).concat(es.filter(e => P(e).guard === undefined || P(e).guard === null));
        const en = plain.length ? plain : es.filter(e => P(e).guard === 'else');
        if (en.length > 1) out.push({ kind: 'nondeterministic', why: `two transitions can fire on ${pystr(ev)} ${Object.keys(ctx).length ? pyrepr(ctx) : ''}`.trim(), edges: en.sort(byKey(keystr)), slots: [] });
      }
    }
    const seen = new Set(), uniq = [];
    for (const b of out) { const k = b.kind + '|' + keystr(b.edges) + '|' + keystr(b.slots); if (!seen.has(k)) { seen.add(k); uniq.push(b); } }
    return uniq;
  }
  function validate(doc, log, C, checks = ['cycles', 'cardinality', 'constraints', 'determinism']) {
    for (const b of breaches(doc.nodes, doc.edges, C, checks)) {
      for (const e of b.edges) if (doc.edges.has(keystr(e))) { doc.edges.delete(keystr(e)); log.push(['invalid', e[0], e[1], '', `INVALID IN ONE DOCUMENT — ${b.why}; excluded`, 'fix the source document']); }
      for (const [nid, k] of b.slots) if (doc.nodes.get(nid) && k in doc.nodes.get(nid).props) { delete doc.nodes.get(nid).props[k]; log.push(['invalid', nid, k, '', `INVALID IN ONE DOCUMENT — ${b.why}; excluded`, 'fix the source document']); }
    }
  }
  function newJ() { return { nodes: new Map(), edges: new Map(), src: new Map(), esrc: new Map(), claims: new Map(), report: [], pairs: [], paradoxes: [] }; }
  function addClaim(J, subject, what, docs, about, p) {
    const ds = docs.slice().sort(), cid = `claim:join/${subject}/${what}@${ds.map(short).join('+')}`;
    J.claims.set(cid, Object.assign({ id: cid, likelihood: 'cannot-judge', confidence: 'low', status: 'contested', rule: 'rule:join@1', stated_in: ds.join(' '), _about: about, _docs: ds }, p || {}));
    return cid;
  }
  const sortedPair = (a, b) => a < b ? [a, b] : [b, a];
  function union(docs, C) {
    docs = [...new Map(docs.map(d => [d.id, d])).values()];
    const J = newJ();
    for (const nid of [...new Set(docs.flatMap(d => [...d.nodes.keys()]))].sort()) {
      const S = docs.filter(d => d.nodes.has(nid)), Ls = S.map(d => [d.id, [...d.nodes.get(nid).labels].sort()]);
      const distinctL = [...new Map(Ls.map(([, L]) => [L.join(':'), L])).values()];
      const sub = (a, b) => a.every(x => b.includes(x));
      let labels;
      if (combos(distinctL).every(([a, b]) => sub(a, b) || sub(b, a))) {
        labels = new Set(Ls.flatMap(([, L]) => L));
        if (distinctL.length > 1) J.report.push(['labels-refine', nid, 'labels', '', 'refined — one adds to the other', '—']);
      } else {
        labels = new Set(distinctL.reduce((a, b) => a.filter(x => b.includes(x)))); const by = new Map();
        for (const [d, L] of Ls) (by.get(L.join(':')) || by.set(L.join(':'), [L, []]).get(L.join(':')))[1].push(d);
        const ids = new Map([...by].map(([k, [L, ds]]) => { const extra = L.filter(x => !labels.has(x)).sort().join(':'); return [k, addClaim(J, nid, 'label/' + extra, ds, [['subject', nid]], { claimed_label: extra })]; }));
        for (const [a, b] of combos([...by.keys()])) { const A = by.get(a)[0], B = by.get(b)[0]; if (!(sub(A, B) || sub(B, A))) J.pairs.push(sortedPair(ids.get(a), ids.get(b))); }
        J.report.push(['identity', nid, 'labels', '', 'IDENTITY CONFLICT — contested', 'check what it is — a register or the party itself']);
      }
      const props = {};
      for (const k of [...new Set(S.flatMap(d => Object.keys(d.nodes.get(nid).props)))].sort()) {
        const vals = S.filter(d => k in d.nodes.get(nid).props).map(d => [d.id, d.nodes.get(nid).props[k]]);
        const distinct = groupBy(vals).map(([v]) => v);
        if (distinct.length === 1) { props[k] = distinct[0]; J.src.set(nid + '\u0000' + k, vals.map(x => x[0]).sort()); continue; }
        const best = distinct.filter(v => distinct.every(w => pyeq(v, w) || refinesV(v, w)));
        if (best.length) { props[k] = best[0]; J.src.set(nid + '\u0000' + k, vals.filter(([, v]) => pyeq(v, best[0])).map(x => x[0]).sort()); J.report.push(['refine', nid, k, '', 'refined — the more precise is kept', '—']); continue; }
        const by = groupBy(vals), ids = by.map(([v, ds]) => addClaim(J, nid, `${k}=${vtext(v)}`, ds, [['subject', nid]], { claimed_property: k, claimed_value: v }));
        combos(by.map((x, i) => i)).forEach(([a, b]) => { if (!compatibleV(by[a][0], by[b][0])) J.pairs.push(sortedPair(ids[a], ids[b])); });
        J.report.push(['value', nid, k, '', 'VALUE CONFLICT — contested', 'find evidence; a finding confirms one']);
      }
      J.nodes.set(nid, { labels, props, stated_in: S.map(d => d.id).sort() });
    }
    const allKeys = new Map(); for (const d of docs) for (const [ks, { key }] of d.edges) allKeys.set(ks, key);
    for (const [ks, key] of [...allKeys].sort(byKey(([k]) => k))) {
      const S = docs.filter(d => d.edges.has(ks)), p = {};
      for (const k of [...new Set(S.flatMap(d => Object.keys(d.edges.get(ks).props)))].sort()) {
        const vals = S.filter(d => k in d.edges.get(ks).props).map(d => [d.id, d.edges.get(ks).props[k]]), by = groupBy(vals);
        if (by.length === 1) { p[k] = by[0][0]; continue; }
        const ids = by.map(([v, ds]) => addClaim(J, key[0], `${key[1]}-${pystr(key[2])}/${identStr(key)}/${k}=${vtext(v)}`, ds, [['subject', key[0]], ['object', key[2]]], { claimed_relationship: key[1], claimed_property: k, claimed_value: v, edge_ident: identStr(key), _key: key }));
        combos(ids).forEach(([a, b]) => J.pairs.push(sortedPair(a, b)));
        J.report.push(['attribute', key[0], `${key[1]} ${k}`, '', 'ATTRIBUTE CONFLICT on a shared relationship — contested', 'find evidence; a finding confirms one']);
      }
      J.edges.set(ks, { key, props: p }); J.esrc.set(ks, S.map(d => d.id).sort());
    }
    return J;
  }
  function merge3(base, a, b, C, hold = true) {
    const J = newJ();
    const slots = d => {   // slot repr -> [slot, value]
      const s = new Map(), put = (sl, v) => s.set(keystr(sl), [sl, v]);
      for (const [nid, n] of d.nodes) { put(['node', nid], true); for (const l of n.labels) put(['label', nid, l], true); for (const [k, v] of Object.entries(n.props)) if (k !== 'id') put(['prop', nid, k], v); }
      for (const { key: k, props: p } of d.edges.values()) { put(['edge', k], true); for (const [x, v] of Object.entries(p)) put(['eprop', k, x], v); }
      return s;
    };
    const O = slots(base), A = slots(a), B = slots(b), res = new Map(), from = new Map(), changedPresence = new Set();
    const get = (M, ks) => M.has(ks) ? M.get(ks)[1] : ABSENT, eqv = (x, y) => (x === ABSENT || y === ABSENT) ? x === y : pyeq(x, y);
    const belongs = (s, n) => (['node', 'label', 'prop'].includes(s[0]) && s[1] === n) || (['edge', 'eprop'].includes(s[0]) && (s[1][0] === n || s[1][2] === n));
    const slotOf = ks => (O.get(ks) || A.get(ks) || B.get(ks))[0];
    const heldBack = new Map(), heldEdges = new Map();
    for (const n of [...O.values()].filter(([s]) => s[0] === 'node').map(([s]) => s[1]).sort()) {
      for (const [[dl, X], [kp, Y]] of [[[a, A], [b, B]], [[b, B], [a, A]]]) {
        if (hold && !X.has(keystr(['node', n])) && Y.has(keystr(['node', n])) && [...new Set([...O.keys(), ...Y.keys()])].some(ks => { const s = slotOf(ks); return belongs(s, n) && s[0] !== 'node' && !eqv(get(Y, ks), get(O, ks)); })) heldBack.set(n, [dl, kp, Y]);
      }
    }
    if (hold) for (const k of [...O.values()].filter(([s]) => s[0] === 'edge').map(([s]) => s[1]).sort(byKey(keystr))) {
      if (heldBack.has(k[0]) || heldBack.has(k[2])) continue;
      for (const [[dl, X], [kp, Y]] of [[[a, A], [b, B]], [[b, B], [a, A]]]) {
        const ek = keystr(['edge', k]);
        if (!X.has(ek) && Y.has(ek) && [...new Set([...O.keys(), ...Y.keys()])].some(ks => { const s = slotOf(ks); return s[0] === 'eprop' && keystr(s[1]) === keystr(k) && !eqv(get(Y, ks), get(O, ks)); })) heldEdges.set(keystr(k), [dl, kp, Y, k]);
      }
    }
    const all = new Map([...O, ...A, ...B]), rows = [];
    for (const [ks, [s]] of [...all].sort(byKey(([k]) => k))) {
      const o = get(O, ks); let x = get(A, ks), y = get(B, ks);
      const hb = [...heldBack.keys()].filter(n => belongs(s, n)), he = [...heldEdges.keys()].filter(k => ['edge', 'eprop'].includes(s[0]) && keystr(s[1]) === k);
      if (he.length && !hb.length) {
        const [dl, kp, Y, k] = heldEdges.get(he[0]), yv = get(Y, ks);
        if (s[0] === 'edge') {
          res.set(ks, [s, true]); from.set(ks, [kp.id]); const about = [['subject', k[0]], ['object', k[2]]];
          J.pairs.push(sortedPair(addClaim(J, k[0], `${k[1]}-${pystr(k[2])}/${identStr(k)}/exists=removed`, [dl.id], about, { claimed_relationship: k[1], edge_ident: identStr(k), _key: k, claimed_absent: true }),
                                  addClaim(J, k[0], `${k[1]}-${pystr(k[2])}/${identStr(k)}/exists=kept`, [kp.id], about, { claimed_relationship: k[1], edge_ident: identStr(k), _key: k, kept: true })));
          J.report.push(['delete-v-change', k[0], 'edge', '', 'REMOVED IN ONE, CHANGED IN THE OTHER — the removal is contested, not applied', 'find evidence; a finding confirms one']);
          continue;
        }
        if (eqv(yv, o)) { if (yv !== ABSENT) { res.set(ks, [s, yv]); from.set(ks, [kp.id]); } continue; }
        if (dl === a) { x = ABSENT; y = yv; } else { x = yv; y = ABSENT; }
      }
      if (hb.length) {
        const [dl, kp, Y] = heldBack.get(hb[0]), yv = get(Y, ks);
        if (s[0] === 'node' && s[1] === hb[0]) {
          res.set(ks, [s, true]); from.set(ks, [kp.id]);
          J.pairs.push(sortedPair(addClaim(J, s[1], 'exists=removed', [dl.id], [['subject', s[1]]], { claimed_node: s[1], claimed_absent: true }),
                                  addClaim(J, s[1], 'exists=kept', [kp.id], [['subject', s[1]]], { claimed_node: s[1], kept: true })));
          J.report.push(['delete-v-change', s[1], 'node', '', 'REMOVED IN ONE, CHANGED IN THE OTHER — the removal is contested, not applied', 'find evidence; a finding confirms one']);
          continue;
        }
        if (eqv(yv, o)) { if (yv !== ABSENT) { res.set(ks, [s, yv]); from.set(ks, [kp.id]); } continue; }
        if (dl === a) { x = ABSENT; y = yv; } else { x = yv; y = ABSENT; }
      }
      let r, src, cat;
      if (eqv(x, y)) { r = x; src = [a.id, b.id]; cat = !eqv(x, o) ? 'both-same' : null; }
      else if (hb.length || he.length) { r = ABSENT; src = []; cat = 'remove-v-change'; }
      else if (eqv(x, o)) { r = y; src = [b.id]; cat = 'one-side-' + (o === ABSENT ? 'addition' : y === ABSENT ? 'removal' : 'change'); }
      else if (eqv(y, o)) { r = x; src = [a.id]; cat = 'one-side-' + (o === ABSENT ? 'addition' : x === ABSENT ? 'removal' : 'change'); }
      else { r = ABSENT; src = []; cat = (x === ABSENT || y === ABSENT) ? 'remove-v-change' : 'both-differ'; }
      if (cat && ['node', 'edge'].includes(s[0])) changedPresence.add(keystr(s[1]));
      if (cat === 'both-differ' || cat === 'remove-v-change') {
        const subj = s[0] === 'prop' ? s[1] : s[1][0], about = s[0] === 'prop' ? [['subject', subj]] : [['subject', s[1][0]], ['object', s[1][2]]], ids = [];
        for (const [d, v] of [[a.id, x], [b.id, y]]) {
          const extra = v === ABSENT ? { claimed_absent: true } : { claimed_value: v }, vt = v === ABSENT ? 'removed' : vtext(v);
          if (s[0] === 'prop') ids.push(addClaim(J, subj, `${s[2]}=${vt}`, [d], about, Object.assign({ claimed_property: s[2] }, extra)));
          else ids.push(addClaim(J, subj, `${s[1][1]}-${pystr(s[1][2])}/${identStr(s[1])}/${s[2]}=${vt}`, [d], about, Object.assign({ claimed_relationship: s[1][1], claimed_property: s[2], edge_ident: identStr(s[1]), _key: s[1] }, extra)));
        }
        J.pairs.push(sortedPair(ids[0], ids[1]));
      }
      if (r !== ABSENT) { res.set(ks, [s, r]); from.set(ks, src); }
      if (cat) rows.push([cat, ['node', 'prop', 'label'].includes(s[0]) ? s[1] : s[1][0], ['node', 'edge'].includes(s[0]) ? s[0] : ['prop', 'label'].includes(s[0]) ? s[2] : `${s[1][1]} ${s[2]}`, '',
        { 'both-same': 'agreed — both made the same change', 'one-side-addition': 'added in one revision only — kept', 'one-side-removal': 'removed in one revision only — removed', 'one-side-change': 'changed in one revision only — the change is kept', 'both-differ': 'BOTH CHANGED, DIFFERENTLY — contested', 'remove-v-change': 'REMOVED IN ONE, CHANGED IN THE OTHER — contested' }[cat],
        ['both-differ', 'remove-v-change'].includes(cat) ? 'find evidence; a finding confirms one' : '—', s]);
    }
    J.report = J.report.concat(rows.filter(r => !(['label', 'prop', 'eprop'].includes(r[6][0]) && changedPresence.has(keystr(r[6][1])) && ['one-side-addition', 'one-side-removal', 'both-same'].includes(r[0]))).map(r => r.slice(0, 6)));
    for (const [ks, [s]] of res) if (s[0] === 'node') J.nodes.set(s[1], { labels: new Set(), props: { id: s[1] }, stated_in: [...new Set([...from.get(ks), ...[a, b].filter(d => d.nodes.has(s[1])).map(d => d.id)])].sort() });
    for (const [ks, [s, v]] of res) {
      if (s[0] === 'label' && J.nodes.has(s[1])) J.nodes.get(s[1]).labels.add(s[2]);
      if (s[0] === 'prop' && J.nodes.has(s[1])) { J.nodes.get(s[1]).props[s[2]] = v; J.src.set(s[1] + '\u0000' + s[2], from.get(ks)); }
      if (s[0] === 'edge') { J.edges.set(keystr(s[1]), { key: s[1], props: {} }); J.esrc.set(keystr(s[1]), [a, b].filter(d => d.edges.has(keystr(s[1]))).map(d => d.id).sort()); }
    }
    for (const [, [s, v]] of res) if (s[0] === 'eprop' && J.edges.has(keystr(s[1]))) J.edges.get(keystr(s[1])).props[s[2]] = v;
    return J;
  }
  function edgeClaim(J, e, docs, extraWhat, props) {
    const id = identStr(e);
    return addClaim(J, e[0], `${e[1]}-${pystr(e[2])}` + (id ? `/${id}` : '') + (extraWhat || ''), docs, [['subject', e[0]], ['object', e[2]]], Object.assign({ claimed_relationship: e[1], edge_ident: id, _key: e, _props: Object.assign({}, props) }, props));
  }
  function finish(J, C, findings = [], checks = ['cycles', 'cardinality', 'constraints', 'determinism', 'flags']) {
    const found = breaches(J.nodes, J.edges, C, checks).filter(b => new Set([...b.edges.flatMap(e => J.esrc.get(keystr(e)) || []), ...b.slots.flatMap(([n, k]) => J.src.get(n + '\u0000' + k) || [])]).size > 1);
    const goneE = new Set(), goneS = [];
    for (const b of found) {
      let ids = [];
      for (const e of b.edges) {
        ids.push(edgeClaim(J, e, J.esrc.get(keystr(e)), '', Object.assign({}, (J.edges.get(keystr(e)) || { props: {} }).props)));
        J.report.push([b.kind, e[0], e[1], '', `PARADOX — ${b.why}`, 'decide which holds; a finding confirms one']); goneE.add(keystr(e));
      }
      for (const [nid, k] of b.slots) {
        const v = J.nodes.get(nid).props[k];
        ids.push(addClaim(J, nid, `${k}=${vtext(v === undefined ? null : v)}`, J.src.get(nid + '\u0000' + k), [['subject', nid]], { claimed_property: k, claimed_value: v === undefined ? null : v }));
        J.report.push([b.kind, nid, k, '', `PARADOX — ${b.why}`, 'decide which holds; a finding confirms one']); goneS.push([nid, k]);
      }
      ids = [...new Set(ids)].sort();
      if (ids.length === 2) J.pairs.push(ids); else J.paradoxes.push(['paradox:join/' + sha256hex(ids.join('|')).slice(0, 10), b.why, ids]);
    }
    for (const e of goneE) J.edges.delete(e);
    for (const [nid, k] of goneS) delete J.nodes.get(nid).props[k];
    if (checks.includes('flags')) {
      const byname = new Map();
      for (const [nid, n] of J.nodes) if ('name' in n.props) { const key = [...n.labels].sort().join(':') + '\u0000' + pystr(n.props.name); (byname.get(key) || byname.set(key, []).get(key)).push(nid); }
      for (const ids of byname.values()) if (ids.length > 1) J.report.push(['duplicate', ids.join(', '), 'name', '', 'POSSIBLE DUPLICATE — flagged, never merged by the join', 'decide; if one thing, declare an id map and re-join']);
      for (const [nid, n] of J.nodes) {
        const known = new Set([...n.labels].flatMap(l => [...(C.vocab[l] || [])]));
        for (const k of Object.keys(n.props)) if (known.size && !known.has(k)) J.report.push(['undeclared', nid, k, '', 'UNDECLARED PROPERTY — flagged', 'declare a unit map, or fix the source']);
      }
    }
    for (const f of findings) {
      const c = J.claims.get(f.confirms); c.status = 'confirmed';
      for (const x of f.refutes) J.claims.get(x).status = 'refuted';
      const s = c._about[0][1];
      if ('claimed_node' in c) {
        if (c.claimed_absent && J.nodes.has(s)) {
          const nd = J.nodes.get(s);
          for (const l of [...nd.labels].sort()) J.claims.get(addClaim(J, s, `label/${l}`, nd.stated_in, [['subject', s]], { claimed_label: l })).status = 'refuted';
          for (const k of Object.keys(nd.props).sort()) if (k !== 'id') { const v = nd.props[k]; J.claims.get(addClaim(J, s, `${k}=${vtext(v)}`, J.src.get(s + '\u0000' + k) || nd.stated_in, [['subject', s]], { claimed_property: k, claimed_value: v })).status = 'refuted'; }
          for (const [ek, { key: e, props }] of [...J.edges].filter(([, { key: e }]) => e[0] === s || e[2] === s)) { J.claims.get(edgeClaim(J, e, J.esrc.get(ek), '', props)).status = 'refuted'; J.edges.delete(ek); }
          J.nodes.delete(s);
        }
      } else if ('claimed_relationship' in c && 'claimed_property' in c) {
        const ek = keystr(c._key);
        if (c.claimed_absent) { if (J.edges.has(ek)) delete J.edges.get(ek).props[c.claimed_property]; }
        else { if (!J.edges.has(ek)) J.edges.set(ek, { key: c._key, props: {} }); J.edges.get(ek).props[c.claimed_property] = c.claimed_value; }
      } else if ('claimed_relationship' in c && c.claimed_absent) {
        const ek = keystr(c._key);
        if (J.edges.has(ek)) { J.claims.get(edgeClaim(J, c._key, J.esrc.get(ek), '/as-kept', J.edges.get(ek).props)).status = 'refuted'; J.edges.delete(ek); }
      } else if ('claimed_relationship' in c && c.kept) { /* the relationship stays as it is */ }
      else if ('claimed_relationship' in c) { J.edges.set(keystr(c._key), { key: c._key, props: Object.assign({}, c._props) }); J.esrc.set(keystr(c._key), c._docs); }
      else if ('claimed_property' in c) { if (!c.claimed_absent) J.nodes.get(s).props[c.claimed_property] = c.claimed_value; }
      else c.claimed_label.split(':').forEach(l => J.nodes.get(s).labels.add(l));
    }
    J.pairs = [...new Map(J.pairs.map(p => [p.join('\u0000'), p])).values()].sort(byKey(p => p.join('\u0000')));
    const against = new Map(), addTo = (k, ds) => { const st = against.get(k) || against.set(k, new Set()).get(k); ds.forEach(d => st.add(d)); };
    for (const [x, y] of J.pairs) { addTo(x, J.claims.get(y)._docs); addTo(y, J.claims.get(x)._docs); }
    for (const [, , ids] of J.paradoxes) for (const x of ids) addTo(x, ids.filter(y => y !== x).flatMap(y => J.claims.get(y)._docs));
    for (const [cid, c] of J.claims) { const sup = c._docs.length, con = [...(against.get(cid) || [])].filter(d => !c._docs.includes(d)).length; c.confidence = sup >= 2 && !con ? 'high' : sup > con ? 'moderate' : 'low'; }
    return J;
  }
  function configFrom(d) {
    d = d || {};
    const C = { maps: d.unit_maps || {}, time: d.time_restatements || {}, id_map: d.id_map || {}, value_maps: (d.vocabulary_maps || []).map(m => ({ type: m.type, attribute: m.attribute, map: m.map })),
      acyclic: d.acyclic || [], at_most_one: (d.at_most_one || []).map(m => ({ type: m.type, side: m.side, rule: m.rule })), vocab: Object.fromEntries(Object.entries(d.vocabulary || {}).map(([k, v]) => [k, new Set(v)])),
      edge_keys: d.identified_by || {}, contexts: d.guard_cases || {} };
    C.constraints = (d.constraints || []).map(c => [c.why, 'gql' in c ? (RULES[c.reference] || null) : RULES[c.rule]]);   // no engine here: a GQL constraint runs as its named twin
    return C;
  }
  function joinDocs(q) {   // q: {docs: [block], base: block|null, config, findings, checks, hold, switches}
    const C = configFrom(q.config), log = [], sw = new Set(q.switches || []);
    const one = (block, base) => { const d = parseDoc(block); if (!base) d._raw = rawProps(d); normalise(d, log, C, sw.has('base-dates') ? null : base); if (!sw.has('validate')) validate(d, log, C); return d; };
    const base = q.base ? one(q.base) : null, docs = q.docs.map(b => one(b, base)), checks = q.checks;
    const J = base && !sw.has('base') ? finish(merge3(base, docs[0], docs[1], C, q.hold), C, q.findings || [], checks) : finish(union(docs, C), C, q.findings || [], checks);
    const pr = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, norm(v)]));
    return { rows: log.concat(J.report).map(r => [r[0], pystr(r[1]), pystr(r[2]), r[4], r[5]]).sort(byKey(jcs)),
      claims: Object.fromEntries([...J.claims].map(([k, c]) => [k, [c.status, c.confidence]])), pairs: J.pairs, paradoxes: J.paradoxes.slice().sort(byKey(jcs)),
      nodes: Object.fromEntries([...J.nodes].map(([k, n]) => [k, [[...n.labels].sort(), pr(n.props)]])),
      edges: Object.fromEntries([...J.edges.values()].map(({ key, props }) => [jcs([key[0], key[1], norm(key[2]), key[3].map(norm)]), pr(props)])) };
  }

  // ── views — the same text as graph_rules.py ────────────────────────────────────
  const SCHEMA_LABELS = [...SPEC_NODES, 'LikelihoodBand'];   // left out of views: the schema, and §20's likelihood scale
  function caption(g, i) { const p = g.p(i), t = p.name || p.title || p.label; return (typeof t === 'string' && t ? `${i}<br/>${t}` : i).replace(/"/g, "'"); }
  const strSort = a => a.sort((x, y) => x < y ? -1 : x > y ? 1 : 0);
  function readings(g, shared) {   // §5: {type: [reading, reverse reading]}, from the graph's own schema, else the shared one it names
    let T = g.labelled('ElementType').map(i => g.p(i));
    if (!T.length && shared) T = shared.labelled('ElementType').map(i => shared.p(i));
    return new Map(T.filter(t => t.kind === 'edge').map(t => [t.name, [t.reading, t.reverse_name]]));
  }
  const word = (R, t) => ((R.get(t) || [])[0] || t.replace(/_/g, ' ').toLowerCase()).replace(/"/g, "'");   // undeclared (a draft): the type's own words
  function mermaidGraph(g, shared) {
    const ids = strSort([...g.nodes.keys()].filter(i => !SCHEMA_LABELS.some(l => g.nodes.get(i)[0].has(l)))), v = new Map(ids.map((i, k) => [i, 'n' + k])), R = readings(g, shared);
    return ['flowchart LR', ...ids.map(i => `    ${v.get(i)}["${caption(g, i)}"]`), ...strSort(g.edges.filter(([s, , d]) => v.has(s) && v.has(d)).map(([s, t, d]) => `    ${v.get(s)} -->|${word(R, t)}| ${v.get(d)}`))].join('\n');
  }
  function legend(g, shared) {
    const ids = new Set([...g.nodes.keys()].filter(i => !SCHEMA_LABELS.some(l => g.nodes.get(i)[0].has(l)))), R = readings(g, shared);
    const used = strSort([...new Set(g.edges.filter(([s, , d]) => ids.has(s) && ids.has(d)).map(e => e[1]))]);
    return used.map(t => `${word(R, t)} = ${t}` + ((R.get(t) || [])[1] ? ` · reverse: ${R.get(t)[1]}` : '')).join('\n');
  }
  function mermaidPath(g, top, level) {
    const items = viewAt(g, top, level), lines = ['flowchart TB', `    p["${caption(g, top)}<br/>at altitude ${level}"]`, ...items.map((x, k) => `    s${k}["${caption(g, x)}"]`)];
    if (items.length) lines.push('    p --> s0');
    for (let k = 0; k < items.length - 1; k++) lines.push(`    s${k} --> s${k + 1}`);
    return lines.join('\n');
  }
  // ── §25 completeness — the twin of completeness() in graph_rules.py; the conformance suite requires the identical report ──
  const CARD_NEEDS = ['kind', 'relationship', 'direction'], COV_NEEDS = ['rows', 'columns', 'of', 'row_link', 'column_link', 'excused_by'];
  const unset = v => v === undefined || v === null || v === '';
  const dayOf = v => v ? String(isTime(v) ? v.s : v).slice(0, 10) : '';
  const parkedState = (g, ds, today) => ds.every(d => { const by = dayOf(g.p(d).revisit_by); return by && by < today; }) ? 'overdue' : 'deferred';
  function completeness(g, today) {
    today = today || new Date().toISOString().slice(0, 10);
    const rules = [];
    for (const r of strSort(g.labelled('Cardinality'))) {
      const p = g.p(r);
      let lack = CARD_NEEDS.filter(k => unset(p[k])).concat(unset(p.min) && unset(p.max) ? ['min or max'] : []);
      if (!lack.length && !['out', 'in'].includes(p.direction)) lack = ["direction 'out' or 'in'"];
      const e = { rule: r, kind: 'cardinality', says: p.says || '', counted: 0, met: 0, excused: 0, missing: [], deferred: [], overdue: [],
                  malformed: lack.length ? 'a Cardinality must carry ' + lack.join(', ') : '' };
      if (!lack.length) {
        const alts = String(p.relationship).split('|').map(t => t.trim()), mn = p.min, mx = p.max, way = p.direction, parked = new Map();
        for (const d of g.labelled('Deferred')) if (g.p(d).rule === r) for (const x of g.out(d, 'DEFERS')) (parked.get(x[2]) || parked.set(x[2], []).get(x[2])).push(d);
        for (const i of strSort(g.labelled(p.kind))) {
          const n = alts.reduce((a, t) => a + (way === 'out' ? g.out(i, t) : g.inc(i, t)).length, 0);
          e.counted++;
          const low = !unset(mn) && n < mn, high = !unset(mx) && n > mx;
          if (!low && !high) { e.met++; continue; }
          if (parked.has(i)) { e[parkedState(g, parked.get(i), today)].push(i); continue; }
          const fix = low ? `add a ${p.relationship} link (${way}): it has ${n}, needs at least ${mn}; or park it with a Deferred whose rule is ${r}`
                          : `remove ${n - mx} of its ${p.relationship} links (${way}): it has ${n}, allows at most ${mx}`;
          e.missing.push({ at: i, found: n, fix });
        }
      }
      rules.push(e);
    }
    for (const r of strSort(g.labelled('Coverage'))) {
      const p = g.p(r), lack = COV_NEEDS.filter(k => unset(p[k]));
      const e = { rule: r, kind: 'coverage', says: p.says || '', counted: 0, met: 0, excused: 0, missing: [], deferred: [], overdue: [],
                  malformed: lack.length ? 'a Coverage must carry ' + lack.join(', ') : '' };
      if (!lack.length) {
        const key = (a, b) => a + '\u0000' + b;
        const pairs = x => g.out(x, p.row_link).flatMap(a => g.out(x, p.column_link).map(b => key(a[2], b[2])));
        const covered = new Set(g.labelled(p.of).flatMap(pairs)), parked = new Map();
        for (const d of g.labelled('Deferred')) for (const k of pairs(d)) (parked.get(k) || parked.set(k, []).get(k)).push(d);
        for (const a of strSort(g.labelled(p.rows))) for (const b of strSort(g.labelled(p.columns))) {
          e.counted++; const at = `${a} × ${b}`, k = key(a, b);
          if (covered.has(k)) { e.met++; continue; }
          const ex = g.out(a, p.excused_by).filter(x => x[2] === b);
          if (ex.some(x => String(x[3].reason || '').trim())) { e.excused++; continue; }
          if (parked.has(k)) { e[parkedState(g, parked.get(k), today)].push(at); continue; }
          const fix = ex.length ? `give the ${p.excused_by} from ${a} to ${b} a reason`
                                : `add a ${p.of} that is ${p.row_link} ${a} and ${p.column_link} ${b}; or excuse the pairing with ${p.excused_by} and a reason; or park it with a Deferred`;
          e.missing.push({ at, found: 0, fix });
        }
      }
      rules.push(e);
    }
    rules.sort((x, y) => x.rule < y.rule ? -1 : x.rule > y.rule ? 1 : 0);
    for (const x of rules) { strSort(x.deferred); strSort(x.overdue); x.missing.sort((m, n) => m.at < n.at ? -1 : m.at > n.at ? 1 : 0); }
    const bad = [];
    for (const d of strSort(g.labelled('Deferred'))) {
      const lack = ['what', 'why'].filter(k => !String(g.p(d)[k] || '').trim());
      if (lack.length) bad.push({ at: d, fix: 'say ' + lack.join(' and ') });
    }
    return { rules, deferred_malformed: bad };
  }

  const tops = g => strSort(g.labelled('Path').filter(p => !g.inc(p, 'STEP').some(e => g.has(e[0], 'Path'))));
  function views(g, shared) {
    const [blocks, rels] = project(g), out = { projection: jcs(JSON.parse(JSON.stringify({ blocks, relationships: rels }))), relationships: mermaidGraph(g, shared), legend: legend(g, shared) };
    for (const t of tops(g)) for (let level = Math.trunc(Number(g.p(t).altitude || 0)); level >= 0; level--) out[`path ${t} at ${level}`] = mermaidPath(g, t, level);
    return out;
  }

  const api = { SPEC_SCHEMA, SPEC_NODES, SPEC_MARKERS, SPEC_EDGES, SCHEMA_LABELS, types, views,mermaidGraph, legend, readings, word, schemaFor, mermaidPath, sha256hex, jcs, hash16, basisHash, GTime, ProfileError, header, tokens, checkSyntax, Store, read, worldFromStore, canon, Graph,
    typed, untyped, project, rebuild, projectsBack, section20, pathsRules, viewAt, below, lensBuckets, review, whyLayer, judgementsRules, servedRules,
    check, completeness, lint, changesetHeader, checkChangeset, parseDoc, union, merge3, finish, configFrom, joinDocs, pyrepr };
  if (typeof module === 'object' && module && module.exports) module.exports = api; else root.GraphSpecCheck = api;
})(typeof self !== 'undefined' ? self : this);
