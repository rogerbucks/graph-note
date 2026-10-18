// Readers of what a data export writes (editor spec §16, export_lossless), for the tests alone. Each reads a file back
// into the things and links it holds, so a round trip proves the export lost nothing. A GQL block is read by the
// repository's own graph-spec reader. CSV and GraphML are read here, strictly, as their standards say:
// - RFC 4180's quoting and its CRLF record ends;
// - XML's references, its line ends made LF and the whitespace in an attribute made spaces, and its comments, refused
//   where XML refuses one.
// So an escape the writer leaves out shows as a difference, never as a reader being kind. Each also gives the notes it
// keeps (editor spec §24, note_standard). For a GQL block that is its `///` lines, read by the library's notes. For
// GraphML it is a comment directly before a node or edge, its escapes read here.
import gs from '@thoughtknot/graph-spec';

/** A graph as a data export holds it: things as [id, kinds, properties], links as [from, type, to, properties]. */
export const dataOf = (g) => ({
  things: [...g.nodes].map(([id, [labels, props]]) => [id, [...labels], props]),
  links: g.edges,
});

/**
 * The one graph a GQL block writes, read by the graph-spec reader, as a data export holds it. It also gives what the
 * block marks as a view's faded context. That is a `//@ faded:` line owned by a thing or link (§27, read by the
 * library's ownedComments). It gives each thing's and link's note too: its `///` lines, read by the library's notes
 * (§26, editor spec §24). The export writes one thing or link to a line, things first.
 */
export function readGql(text) {
  const world = gs.worldFromStore(gs.read([text]));
  const names = Object.keys(world);
  if (names.length !== 1) throw new Error(`the block wrote ${names.length} graphs`);
  const data = dataOf(world[names[0]]);
  const code = text
    .split('\n')
    .map((line, i) => [line.trim(), i + 1])
    .filter(([line]) => line && !line.startsWith('//'))
    .map(([, n]) => n);
  // a thing by its id, a link by its place among the links, from the line of code that writes it
  const owner = (line, thing, link) => {
    const at = code.indexOf(line);
    if (at < data.things.length) thing(data.things[at][0]);
    else link(at - data.things.length);
  };
  const faded = { things: [], links: [] };
  for (const { line, tags } of gs.ownedComments(text).owned) {
    if (!tags.some(([k]) => k === 'faded')) continue;
    owner(
      line,
      (id) => faded.things.push(id),
      (i) => faded.links.push(i),
    );
  }
  const notes = { things: [], links: [] };
  for (const { line, text: note } of gs.notes(text).notes)
    owner(
      line,
      (id) => notes.things.push([id, note]),
      (i) => notes.links.push([i, note]),
    );
  return { graph: names[0], ...data, faded, notes };
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
  if (kind === 'date') {
    if (!/^\d{4}-\d\d-\d\d$/.test(s)) throw new Error(`${s} is not a day, YYYY-MM-DD`);
    return new gs.GTime('date', s);
  }
  if (kind === 'datetime') {
    // as the reader keeps an instant: in UTC, to the second, with six digits of a fraction when it has one
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{6})?Z$/.test(s)) throw new Error(`${s} is not an instant in UTC`);
    return new gs.GTime('datetime', s.slice(0, -1));
  }
  throw new Error(`no kind of value called ${kind}`);
}

const FIXED = ['kind', 'id', 'labels', 'from', 'type', 'to'];

/** The things and links of a CSV export, and those of kind `faded thing` or `faded link`, a view's faded context. An
 * empty cell that is not quoted is a property the row does not have. CSV has no comments, so it holds no note. */
export function readCsv(text) {
  const [head, ...rows] = csvRecords(text);
  const names = head.map((c) => c.text);
  if (FIXED.some((n, i) => names[i] !== n)) throw new Error(`the header begins ${names.slice(0, 6).join(',')}`);
  const columns = names.slice(FIXED.length).map((n) => {
    const at = n.lastIndexOf(':');
    return { key: n.slice(0, at), kind: n.slice(at + 1) };
  });
  const things = [],
    links = [],
    faded = { things: [], links: [] };
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
    const [written, id, labels, from, type, to] = row.map((c) => c.text);
    const kind = written.replace(/^faded /, '');
    if (kind === 'thing') {
      things.push([unguarded(id), labels ? labels.split(';') : [], { id: unguarded(id), ...props }]);
      if (kind !== written) faded.things.push(unguarded(id));
    } else if (kind === 'link') {
      links.push([unguarded(from), type, unguarded(to), props]);
      if (kind !== written) faded.links.push(links.length - 1);
    } else throw new Error(`a row of kind ${written}`);
  }
  return { things, links, faded, notes: { things: [], links: [] } };
}

const REFS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// a character XML 1.0 cannot hold, even as a reference. With the u flag a whole surrogate pair is one character, so
// only half of one alone is in the range
const NOT_XML = /[\0-\x08\x0B\x0C\x0E-\x1F\u{FFFE}\u{FFFF}\u{D800}-\u{DFFF}]/u;

/** Text as XML reads it: its references replaced, after its line ends were made LF. A literal `]]>` is refused: XML
 * forbids it in text, and the writer escapes every `>`, so it is never in an attribute either. */
function decoded(raw) {
  if (NOT_XML.test(raw)) throw new Error('a character XML 1.0 cannot hold');
  if (raw.includes('<')) throw new Error('a < that is not a tag');
  if (raw.includes(']]>')) throw new Error('a ]]> that XML does not allow in text');
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

/** A comment's text as XML reads it, its line ends made LF. It is refused where XML refuses it: `--` inside it, a `-`
 * at its end, or a character XML 1.0 cannot hold. */
function commentText(raw) {
  const text = raw.replace(/\r\n?/g, '\n');
  if (text.includes('--')) throw new Error('-- inside a comment, which XML forbids');
  if (text.endsWith('-')) throw new Error('a comment ending with -, which XML forbids');
  if (NOT_XML.test(text)) throw new Error('a character XML 1.0 cannot hold, in a comment');
  return text;
}

/**
 * A note from the text of the XML comment that holds it, read strictly and on its own. It is read as the writer is
 * meant to write it (editor spec §24, note_standard). The escapes:
 * - one space at each end;
 * - `\\` a backslash, `\-` a hyphen, `\r` a carriage return;
 * - `\u{…}` a character by its code point in hexadecimal.
 * Any other backslash is refused, so a writer that leaves an escape out shows.
 */
export function commentNote(text) {
  if (text.length < 2 || text[0] !== ' ' || text.at(-1) !== ' ')
    throw new Error('a note comment not spaced at its ends');
  const s = text.slice(1, -1);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') {
      out += s[i];
      continue;
    }
    const e = s[++i];
    if (e === '\\' || e === '-') out += e;
    else if (e === 'r') out += '\r';
    else if (e === 'u' && s[i + 1] === '{') {
      const end = s.indexOf('}', i);
      const hex = end < 0 ? '' : s.slice(i + 2, end);
      if (!/^[0-9A-F]{1,6}$/.test(hex) || parseInt(hex, 16) > 0x10ffff)
        throw new Error(`\\u{${hex}} names no character`);
      out += String.fromCodePoint(parseInt(hex, 16));
      i = end;
    } else throw new Error(`\\${e ?? ''} is no escape a note's comment is written with`);
  }
  return out;
}

/** An XML text's root element: `{ name, attrs, children }`, each child an element, a text or a comment (`{ comment }`,
 * its text), whitespace kept inside the root. The declaration is dropped; an attribute's line ends and tabs become
 * spaces, as XML says. A comment is read from its `<!--` to the first `-->`, as XML reads one. It is refused where XML
 * refuses it; one outside the root is refused, as no export writes one there. */
export function xmlTree(text) {
  const body = text.replace(/^<\?xml[^?]*\?>/, '');
  const tag = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/y;
  const root = { children: [] },
    open = [root];
  let at = 0;
  for (;;) {
    const next = body.indexOf('<', at);
    const between = body.slice(at, next < 0 ? undefined : next);
    if (open.length > 1 && between) open.at(-1).children.push(decoded(between));
    else if (between.trim()) throw new Error('text outside the root element');
    if (next < 0) break;
    if (body.startsWith('<!--', next)) {
      if (open.length === 1) throw new Error('a comment outside the root element, which no export writes');
      const end = body.indexOf('-->', next + 4);
      if (end < 0) throw new Error('a comment that is not closed');
      open.at(-1).children.push({ comment: commentText(body.slice(next + 4, end)) });
      at = end + 3;
      continue;
    }
    tag.lastIndex = next;
    const m = tag.exec(body);
    if (!m) throw new Error('a < that is not a tag');
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

/** The kinds a GraphML key's description gives, beyond GraphML's own types: a day or an instant, each kept as a string. */
const DESC_KINDS = { 'gn:date': 'date', 'gn:datetime': 'datetime' };

/** The things and links of a GraphML export, with the name of its graph, and those its `:faded` key marks true. */
export function readGraphml(text) {
  const root = xmlTree(text);
  if (root.name !== 'graphml' || root.attrs.xmlns !== 'http://graphml.graphdrawing.org/xmlns')
    throw new Error('not GraphML');
  const ATTR_KINDS = { string: 'text', double: 'number', boolean: 'boolean' };
  const keys = new Map(
    elements(root, 'key').map((k) => {
      const [desc] = elements(k, 'desc');
      return [
        k.attrs.id,
        {
          for: k.attrs.for,
          name: k.attrs['attr.name'],
          kind: (desc && DESC_KINDS[textOf(desc)]) || ATTR_KINDS[k.attrs['attr.type']],
        },
      ];
    }),
  );
  const [graph] = elements(root, 'graph');
  if (graph.attrs.edgedefault !== 'directed') throw new Error('the graph is not directed');
  const read = (el, domain) => {
    const out = { props: {}, own: {} };
    for (const d of elements(el, 'data')) {
      const key = keys.get(d.attrs.key);
      if (!key || (key.for !== domain && key.for !== 'all'))
        throw new Error(`data under no ${domain} key: ${d.attrs.key}`);
      const into = key.name.startsWith(':') ? out.own : out.props;
      if (key.name in into) throw new Error(`${key.name} is given twice`);
      into[key.name] = key.name.startsWith(':') ? textOf(d) : valueOf(key.kind, textOf(d));
    }
    return out;
  };
  const byNode = new Map(),
    faded = { things: [], links: [] };
  const things = elements(graph, 'node').map((n) => {
    const { props, own } = read(n, 'node');
    byNode.set(n.attrs.id, own[':id']);
    if (own[':faded'] === 'true') faded.things.push(own[':id']);
    return [own[':id'], own[':labels'] ? own[':labels'].split(';') : [], { id: own[':id'], ...props }];
  });
  const links = elements(graph, 'edge').map((e, i) => {
    const { props, own } = read(e, 'edge');
    if (own[':faded'] === 'true') faded.links.push(i);
    return [byNode.get(e.attrs.source), own[':type'], byNode.get(e.attrs.target), props];
  });
  // each note is the comment directly before its node or edge, with only whitespace between. A comment before anything
  // else, or two before one element, is refused, as the export writes neither
  const notes = { things: [], links: [] };
  let pending = null,
    node = 0,
    edge = 0;
  for (const c of graph.children) {
    if (typeof c === 'string') {
      if (c.trim()) throw new Error('text between the elements of the graph');
    } else if ('comment' in c) {
      if (pending !== null) throw new Error('two comments before one element');
      pending = commentNote(c.comment);
    } else {
      if (pending !== null && c.name === 'node') notes.things.push([things[node][0], pending]);
      else if (pending !== null && c.name === 'edge') notes.links.push([edge, pending]);
      else if (pending !== null) throw new Error(`a comment before <${c.name}>, which holds no note`);
      if (c.name === 'node') node++;
      if (c.name === 'edge') edge++;
      pending = null;
    }
  }
  if (pending !== null) throw new Error('a comment before no element');
  return { graph: graph.attrs.id, things, links, faded, notes };
}

const readerOf = (format) => (format === 'gql' ? readGql : format === 'csv' ? readCsv : readGraphml);

/** The things and links a data export of `format` holds, read back by that format's reader. */
export function readBack(format, text) {
  const { things, links } = readerOf(format)(text);
  return { things, links };
}

/** What a data export of `format` marks as a view's faded context: things by id, links by their place among the links. */
export const readFaded = (format, text) => readerOf(format)(text).faded;

/** The notes a data export of `format` keeps: things' as [id, text], links' as [place among the links, text]. */
export const readNotes = (format, text) => readerOf(format)(text).notes;
