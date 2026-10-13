// Readers of what a data export writes (editor spec §16, export_lossless), for the tests alone: each reads a file back
// into the things and links it holds, so a round trip proves the export lost nothing. A GQL block is read by the
// repository's own graph-spec reader. CSV and GraphML are read here, strictly, as their standards say: RFC 4180's
// quoting and its CRLF record ends; XML's references, its line ends made LF and the whitespace in an attribute made
// spaces. So an escape the writer leaves out shows as a difference, never as a reader being kind.
import gs from '@graph-note/graph-spec';

/** A graph as a data export holds it: things as [id, kinds, properties], links as [from, type, to, properties]. */
export const dataOf = (g) => ({
  things: [...g.nodes].map(([id, [labels, props]]) => [id, [...labels], props]),
  links: g.edges,
});

/** The one graph a GQL block writes, read by the graph-spec reader, as a data export holds it. */
export function readGql(text) {
  const world = gs.worldFromStore(gs.read([text]));
  const names = Object.keys(world);
  if (names.length !== 1) throw new Error(`the block wrote ${names.length} graphs`);
  return { graph: names[0], ...dataOf(world[names[0]]) };
}

/** The records of a CSV text (RFC 4180), each a list of cells, each `{ text, quoted }`; records end at CRLF. */
export function csvRecords(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const record = [];
    for (;;) {
      let cell = '',
        quoted = false;
      if (text[i] === '"') {
        quoted = true;
        i++;
        for (;;) {
          if (i >= text.length) throw new Error('a quoted cell is not closed');
          if (text[i] === '"' && text[i + 1] === '"') {
            cell += '"';
            i += 2;
          } else if (text[i] === '"') {
            i++;
            break;
          } else cell += text[i++];
        }
      } else
        while (i < text.length && !',\r\n'.includes(text[i])) {
          if (text[i] === '"') throw new Error('a quote in a cell that is not quoted');
          cell += text[i++];
        }
      record.push({ text: cell, quoted });
      if (text[i] !== ',') break;
      i++;
    }
    if (i < text.length) {
      if (text[i] !== '\r' || text[i + 1] !== '\n') throw new Error(`a record ends with ${JSON.stringify(text[i])}`);
      i += 2;
    }
    out.push(record);
  }
  return out;
}

/** A CSV text cell as written: one guarding apostrophe taken off. */
const unguarded = (s) => (s.startsWith("'") ? s.slice(1) : s);

/** A value of `kind` from its text, as a data export writes it; a CSV text has its guard taken off. */
function valueOf(kind, s, csv = false) {
  if (kind === 'text') return csv ? unguarded(s) : s;
  if (kind === 'number') {
    if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/.test(s)) throw new Error(`${s} is not a number`);
    return Number(s);
  }
  if (kind === 'boolean') {
    if (s !== 'true' && s !== 'false') throw new Error(`${s} is not true or false`);
    return s === 'true';
  }
  if (kind === 'date') return new gs.GTime('date', s);
  if (kind === 'datetime') {
    if (!s.endsWith('Z')) throw new Error(`${s} is not in UTC`);
    return new gs.GTime('datetime', s.slice(0, -1));
  }
  throw new Error(`no kind of value called ${kind}`);
}

const FIXED = ['kind', 'id', 'labels', 'from', 'type', 'to'];

/** The things and links of a CSV export. An empty cell that is not quoted is a property the row does not have. */
export function readCsv(text) {
  const [head, ...rows] = csvRecords(text);
  const names = head.map((c) => c.text);
  if (FIXED.some((n, i) => names[i] !== n)) throw new Error(`the header begins ${names.slice(0, 6).join(',')}`);
  const columns = names.slice(FIXED.length).map((n) => {
    const at = n.lastIndexOf(':');
    return { key: n.slice(0, at), kind: n.slice(at + 1) };
  });
  const things = [],
    links = [];
  for (const row of rows) {
    if (row.length !== names.length) throw new Error(`a row of ${row.length} cells under ${names.length} columns`);
    const props = {};
    columns.forEach(({ key, kind }, k) => {
      const cell = row[FIXED.length + k];
      if (cell.text !== '' || cell.quoted) {
        if (key in props) throw new Error(`${key} is given twice in a row`);
        props[key] = valueOf(kind, cell.text, true);
      }
    });
    const [kind, id, labels, from, type, to] = row.map((c) => c.text);
    if (kind === 'thing')
      things.push([unguarded(id), labels ? labels.split(';') : [], { id: unguarded(id), ...props }]);
    else if (kind === 'link') links.push([unguarded(from), type, unguarded(to), props]);
    else throw new Error(`a row of kind ${kind}`);
  }
  return { things, links };
}

const REFS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// a character XML 1.0 cannot hold, even as a reference; with the u flag a whole surrogate pair is one character, so only
// half of one alone is in the range
const NOT_XML = /[\0-\x08\x0B\x0C\x0E-\x1F\u{FFFE}\u{FFFF}\u{D800}-\u{DFFF}]/u;

/** Text as XML reads it: its references replaced, after its line ends were made LF. */
function decoded(raw) {
  if (NOT_XML.test(raw)) throw new Error('a character XML 1.0 cannot hold');
  if (raw.includes('<')) throw new Error('a < that is not a tag');
  return raw.replace(/\r\n?/g, '\n').replace(/&([^;]*);|&/g, (m, ref) => {
    if (ref === undefined) throw new Error('an & that is no reference');
    if (ref in REFS) return REFS[ref];
    const code = /^#x([0-9A-Fa-f]+)$/.exec(ref)?.[1] ?? /^#(\d+)$/.exec(ref)?.[1];
    if (code === undefined) throw new Error(`&${ref}; is no reference XML names`);
    const cp = ref.startsWith('#x') ? parseInt(code, 16) : Number(code);
    const c = String.fromCodePoint(cp);
    if (NOT_XML.test(c)) throw new Error(`&${ref}; names a character XML 1.0 cannot hold`);
    return c;
  });
}

/** An XML text's root element: `{ name, attrs, children }`, each child an element or a text, whitespace kept inside
 * the root. The declaration and comments are dropped; an attribute's line ends and tabs become spaces, as XML says. */
export function xmlTree(text) {
  const body = text.replace(/^<\?xml[^?]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '');
  const tag = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  const root = { children: [] },
    open = [root];
  let at = 0,
    m;
  while ((m = tag.exec(body))) {
    const between = body.slice(at, m.index);
    if (open.length > 1) open.at(-1).children.push(decoded(between));
    else if (between.trim()) throw new Error('text outside the root element');
    at = tag.lastIndex;
    const [, closing, name, attrText, empty] = m;
    if (closing) {
      if (open.pop().name !== name) throw new Error(`</${name}> closes another element`);
      continue;
    }
    const attrs = {};
    for (const [, k, v] of attrText.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g))
      attrs[k] = decoded(v.replace(/\r\n?/g, '\n').replace(/[\t\n]/g, ' '));
    const el = { name, attrs, children: [] };
    open.at(-1).children.push(el);
    if (!empty) open.push(el);
  }
  if (open.length !== 1 || body.slice(at).trim()) throw new Error('the XML is not closed');
  const [only, ...rest] = root.children;
  if (!only || rest.length) throw new Error('XML has one root element');
  return only;
}

const elements = (el, name) => el.children.filter((c) => typeof c === 'object' && c.name === name);
const textOf = (el) => el.children.filter((c) => typeof c === 'string').join('');

/** The namespace a GraphML export says the kind of a value in, beyond GraphML's own types. */
export const GRAPHML_KINDS = 'https://github.com/rogerbucks/graph-note#graphml';

/** The things and links of a GraphML export, with the name of its graph. */
export function readGraphml(text) {
  const root = xmlTree(text);
  if (root.name !== 'graphml' || root.attrs.xmlns !== 'http://graphml.graphdrawing.org/xmlns')
    throw new Error('not GraphML');
  const prefix = Object.entries(root.attrs).find(([k, v]) => k.startsWith('xmlns:') && v === GRAPHML_KINDS)?.[0];
  const kindAttr = prefix ? `${prefix.slice('xmlns:'.length)}:kind` : null;
  const ATTR_KINDS = { string: 'text', double: 'number', boolean: 'boolean' };
  const keys = new Map(
    elements(root, 'key').map((k) => [
      k.attrs.id,
      {
        for: k.attrs.for,
        name: k.attrs['attr.name'],
        kind: (kindAttr && k.attrs[kindAttr]) || ATTR_KINDS[k.attrs['attr.type']],
      },
    ]),
  );
  const [graph] = elements(root, 'graph');
  if (graph.attrs.edgedefault !== 'directed') throw new Error('the graph is not directed');
  const read = (el, domain) => {
    const out = { props: {}, own: {} };
    for (const d of elements(el, 'data')) {
      const key = keys.get(d.attrs.key);
      if (!key || key.for !== domain) throw new Error(`data under no ${domain} key: ${d.attrs.key}`);
      const into = key.name.startsWith(':') ? out.own : out.props;
      if (key.name in into) throw new Error(`${key.name} is given twice`);
      into[key.name] = key.name.startsWith(':') ? textOf(d) : valueOf(key.kind, textOf(d));
    }
    return out;
  };
  const byNode = new Map();
  const things = elements(graph, 'node').map((n) => {
    const { props, own } = read(n, 'node');
    byNode.set(n.attrs.id, own[':id']);
    return [own[':id'], own[':labels'] ? own[':labels'].split(';') : [], { id: own[':id'], ...props }];
  });
  const links = elements(graph, 'edge').map((e) => {
    const { props, own } = read(e, 'edge');
    return [byNode.get(e.attrs.source), own[':type'], byNode.get(e.attrs.target), props];
  });
  return { graph: graph.attrs.id, things, links };
}

/** The things and links a data export of `format` holds, read back by that format's reader. */
export function readBack(format, text) {
  const { things, links } = format === 'gql' ? readGql(text) : format === 'csv' ? readCsv(text) : readGraphml(text);
  return { things, links };
}
