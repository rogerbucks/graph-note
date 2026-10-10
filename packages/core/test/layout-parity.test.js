// The layout source the core writes for a note is byte-identical to the one graph_svg.py writes for it (spec §12, "same
// layout as Python"), in both directions. Python chooses the boxes and links as graph-spec-draw.py does — the lines below
// mirror it — from the Python library, live. The vault's conformance suite runs the same comparison on every vault graph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { layoutSource } from '../src/layout.ts';

const PY_SRC = fileURLToPath(new URL('../../../python/graph_spec/src', import.meta.url));

const PYTHON = `
import json, re, sys
sys.path.insert(0, ${JSON.stringify(PY_SRC)})
import gql_profile as gp, graph_rules as gr, graph_svg
out = []
for item in json.load(sys.stdin):
    # a note is its text, or its text and the budget of reading again both readers are given
    note, budget = item if isinstance(item, list) else (item, None)
    blocks = re.findall(r"\`\`\`gql\\n(.*?)\\n\`\`\`", note, re.S)
    # what can be read of every block, as the core reads it: a block that cannot be read is drawn in part (8 Oct 2026)
    store, problems = gp.read_for_drawing(blocks, **({} if budget is None else {'budget': budget}))
    w = gr.World.from_store(store)
    res = {}
    for name in sorted(n for n in w.graphs if not n.startswith('schema ')):
        # a thing written without a name is drawn under its suggested name, marked as suggested (10 Oct 2026)
        suggested = {p['suggested'] for p in problems if p.get('suggested') and p['graph'] == name}
        g = w[name]
        ids = [i for i, (l, _) in g.nodes.items() if not l & gr.SCHEMA_LABELS]; R = gr.readings(g, None)
        def text(i):
            p = g.p(i); return next((p[k] for k in ('name', 'title', 'text', 'label') if isinstance(p.get(k), str) and p[k]), i)
        nodes = [(i, ' · '.join(sorted(l for l in g.nodes[i][0] if l not in gr.SCHEMA_LABELS)), text(i)) for i in ids]
        edges = [(s, gr._word(R, t), d) for s, t, d, _ in g.edges if s in ids and d in ids]
        res[name] = {rd: graph_svg.dot_source(nodes, edges, rd, suggested=suggested)[0] for rd in ('LR', 'TB')}
    out.append(res)
print(json.dumps(out))
`;

const fence = (body) => '```gql\n' + body + '\n```';
const NOTES = {
  'a question, its options and reasons, with a schema written last': [
    fence(`// graph: reader · SOURCE
(reader_question:Question {title: 'Which device should I read long PDFs on?'}),
(large_reader:Option {name: 'Large e-ink reader'}),
(small_reader:Option {name: 'Small e-ink reader'}),
(tablet:Option {name: 'Keep using the tablet'}),
(large_reader)-[:ANSWERS]->(reader_question),
(small_reader)-[:ANSWERS]->(reader_question),
(tablet)-[:ANSWERS]->(reader_question)`),
    'Some prose between the steps.',
    fence(`// graph: reader · SOURCE
(a4_pages:Reason {title: 'A4 pages need a screen of about 10 inches or more'}),
(easy_on_eyes:Reason {title: 'E-ink is easier on the eyes over long sessions'}),
(costs_nothing:Reason {title: 'The tablet costs nothing extra'}),
(a4_pages)-[:FAVOURS]->(large_reader),
(a4_pages)-[:COUNTS_AGAINST]->(small_reader),
(easy_on_eyes)-[:FAVOURS]->(large_reader),
(easy_on_eyes)-[:FAVOURS]->(small_reader),
(costs_nothing)-[:FAVOURS]->(tablet)`),
    fence(`// graph: reader · SOURCE
(trial_notes:Source {title: 'Notes from a two-week trial', started: DATE '2026-09-21'}),
(a4_pages)-[:CITES {where: 'day 2'}]->(trial_notes),
(buy_large_reader:Decision {title: 'Buy the large e-ink reader', decided_on: DATE '2026-10-06'}),
(buy_large_reader)-[:DECIDES]->(reader_question),
(buy_large_reader)-[:CHOSE]->(large_reader)
SET large_reader.status = 'bought'`),
    fence(`// graph: my_graph · excerpt — an example, not data
(first_thing:Thing {name: 'First thing'})`),
    fence(`// graph: reader · SOURCE
(reader_schema:GraphMeta {graph: 'reader', schema: 'reader@1'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source', reading: 'answers', reverse_name: 'is answered by'}),
(link_favours:Meta:ElementType {name: 'FAVOURS', kind: 'edge', origin: 'source', reading: 'favours', reverse_name: 'is favoured by'}),
(link_against:Meta:ElementType {name: 'COUNTS_AGAINST', kind: 'edge', origin: 'source', reading: 'counts against', reverse_name: 'is counted against by'})`),
  ].join('\n\n'),
  'two graphs, several kinds on one thing, text from each property in turn': [
    fence(`// graph: alpha
(a:Person:Author {name: 'Ada'}), (b:Book {title: 'Notes'}), (c:Book {text: 'A text'}), (d:Book {label: 'A label'}), (e:Book),
(a)-[:WROTE]->(b), (a)-[:WROTE]->(c), (b)-[:CITES]->(c), (d)-[:CITES]->(e)`),
    fence(`// graph: beta
(x:Thing {name: 'Quotes " and & and <b>'}), (y:Thing {name: 'A very long name that wraps over several lines in its box'}),
(x)-[:IS_PART_OF]->(y)`),
  ].join('\n'),
};

/** Holds the core's layout source for each note to graph_svg.py's, for every graph and in both directions. */
function same(notes) {
  const names = Object.keys(notes);
  const r = spawnSync('python3', ['-c', PYTHON], { input: JSON.stringify(Object.values(notes)), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const python = JSON.parse(r.stdout);
  names.forEach((name, n) => {
    // a note is its text, or its text and the budget of reading again both readers are given
    const [note, budget] = Array.isArray(notes[name]) ? notes[name] : [notes[name]];
    const reading = readNote(
      gqlBlocks(note).map((b) => b.text),
      undefined,
      [],
      budget,
    );
    assert.deepEqual([...reading.graphs.keys()].sort(), Object.keys(python[n]), name);
    for (const [graph, drawing] of reading.graphs) {
      for (const rd of ['LR', 'TB'])
        assert.equal(layoutSource(drawing, rd).source, python[n][graph][rd], `${name}: ${graph} ${rd}`);
    }
  });
}

test('the core writes the same layout source as graph_svg.py, for every graph and in both directions', () => {
  same(NOTES);
});

const PARTIAL = {
  // a comment after code on its line, and an emoji before an item left out (9 Oct 2026)
  'a comment after code, and an emoji before an item left out': [
    fence("// graph: trip\n(home:Place {name: 'Home 🏠'}), // where it starts\n(walk:Leg {name: 'Walk'}),"),
    fence("// graph: trip\n(bus:Leg {name: '🚌 Bus'}), (gone)-[:R]->(home), (bus)-[:FOLLOWS]->(walk)"),
  ].join('\n'),
  // a comma with nothing after it, as a block is while its next pattern is being typed (8 Oct 2026)
  'a block ending in a comma with nothing after it': [
    fence("// graph: trip\n(home:Place {name: 'Home'}),\n(walk:Leg {name: 'Walk'}),\n(walk)-[:STARTS_AT]->(home),"),
  ].join('\n'),
  // a block that cannot be read is drawn in part, by every reader (decided with Roger, 8 Oct 2026): what the vault's
  // layout check found Python dropping whole while the plugin drew the rest
  'a block opening with a MATCH for a thing not in the graph, then new things and links': [
    fence("// graph: trip\n(home:Place {name: 'Home'})"),
    fence(`// graph: trip
MATCH (gone:Place {id: 'station'})
INSERT (walk:Leg {name: 'Walk'}),
(bus:Leg {name: 'Bus'}),
(walk)-[:STARTS_AT]->(home),
(walk)-[:ENDS_AT]->(gone),
(bus)-[:FOLLOWS]->(walk)`),
  ].join('\n'),
  'a second block writing again an id the graph has, then new things and links': [
    fence("// graph: trip\n(home:Place {name: 'Home'}),\n(walk:Leg {name: 'Walk'})"),
    fence(`// graph: trip
(walk:Leg {name: 'Walk again'}),
(bus:Leg {name: 'Bus'}),
(train:Leg {name: 'Train'}),
(bus)-[:FOLLOWS]->(walk),
(train)-[:FOLLOWS]->(bus),
(train)-[:ENDS_AT]->(home)`),
  ].join('\n'),
};

// never freeze (spec §9, 10 Oct 2026): past a budget of reading a broken block again, both readers leave the rest of it out
// at once, from the failing line; each read again, and each trial of which part on a line is at fault, is charged its
// length in UTF-16 units. A small budget, given to both, shows the cut on a note of a few lines.
const LINES = `// graph: trip
(home:Place {name: 'Home 🏠'}),
(walk:Leg {name: 'Walk'}),
(bus:Leg {name 'Bus'}),
(train:Leg {name 'Train'}),
(tram:Leg {name 'Tram'}),
(walk)-[:STARTS_AT]->(home)`;
const ONE_LINE = `// graph: trip
(start:Place {name: 'Start'}),
(home:Place {name: 'Home'}), (walk:Leg {name 'Walk'}), (bus:Leg {name: 'Bus'})
(ferry:Leg {name: 'Ferry'})`;
PARTIAL['past the budget, the rest of a block left out from the failing line'] = [fence(LINES), 2 * LINES.length];
PARTIAL['past the budget while telling which part on a line is at fault'] = [fence(ONE_LINE), 2 * ONE_LINE.length];

test('a block that cannot be read is drawn in part, the same by both readers, byte for byte', () => {
  same(PARTIAL);
  const cut = readNote([LINES], 0, [], 2 * LINES.length);
  assert.deepEqual(
    cut.graphs.get('trip').boxes.map((b) => b.key),
    ['home', 'walk'],
    'the cut is made: bus and train left out alone, tram with the rest',
  );
  assert.deepEqual(
    readNote([ONE_LINE], 0, [], 2 * ONE_LINE.length)
      .graphs.get('trip')
      .boxes.map((b) => b.key),
    ['start'],
    'the trials charged too: the line is left out from its start, with what follows',
  );
});

const UNNAMED = {
  // unnamed_drawn_suggested (spec §4, Roger, 10 Oct 2026): a thing written without a name is drawn under its suggested
  // name, dashed and labelled as suggested, by every reader alike
  'things written without a name, in two blocks of one graph, one after an emoji, one in a path': [
    fence(`// graph: reader
(question:Question {title: 'Which device?'}),
(small_reader:Option {name: 'Small reader 📖'}), (:Option {name: 'Large reader'}),
(small_reader)-[:ANSWERS]->(question)`),
    fence(`// graph: reader
({title: 'Costs nothing extra'})-[:FAVOURS]->(small_reader),
(:Option {name: 'Large reader'}),
(:Reason {title: 'Match'})`),
  ].join('\n'),
};

test('a thing written without a name is drawn under the same suggested name, marked the same, by both readers', () => {
  same(UNNAMED);
  const d = readNote(gqlBlocks(UNNAMED[Object.keys(UNNAMED)[0]]).map((b) => b.text)).graphs.get('reader');
  assert.deepEqual(
    d.boxes.filter((b) => b.suggested).map((b) => b.key),
    ['large_reader', 'costs_nothing', 'large_reader_2', 'match_2'],
  );
  const source = layoutSource(d, 'LR').source;
  assert.equal(source.match(/style="rounded,filled,dashed"/g)?.length, 4, 'each drawn dashed');
  assert.equal(source.match(/✎ SUGGESTED NAME/g)?.length, 4, 'and labelled, by a sign and in words');
});

const REFERRED = {
  // a link written to the name shown on the drawing links to the thing drawn under it, by both readers (review of
  // 224929a): a name only referred to is not taken, so the suggestion does not move away from it
  'a link to the suggested name, written before the name is': [
    fence(`// graph: reader
(:Option {name: 'Large reader'}),
(q:Q {name: 'Q'}),
(large_reader)-[:ANSWERS]->(q)`),
  ].join('\n'),
};

test('a link written to a suggested name links to the thing drawn under it, the same by both readers', () => {
  same(REFERRED);
  const r = readNote(gqlBlocks(REFERRED[Object.keys(REFERRED)[0]]).map((b) => b.text));
  const d = r.graphs.get('reader');
  assert.deepEqual(
    d.links.map((l) => [l.from, l.type, l.to]),
    [['large_reader', 'ANSWERS', 'q']],
  );
  assert.deepEqual(d.estimates, []);
  assert.deepEqual(
    r.problems.map((p) => p.suggested),
    ['large_reader'],
  );
});

// Whitespace is what GQL names, in every reader, never the language's own idea of it; a line ends at LF only
// (decided 10 Oct 2026). U+0085 and U+FEFF are not whitespace, so an item they open is left out, by both readers alike.
const WHITESPACE = {
  'whitespace inside strings, between items and before keywords': [
    fence(
      "// graph: ws\n(home:Place {name: 'Home\xa0sweet\u{2028}home'}),\u{2029}" +
        "(walk:Leg {name: 'twenty-two characters \u{feff} after'}),\u{180e}" +
        "(bus:Leg {name: 'twenty-two characters \x1c after, \x85 and\u{3000}on'}),\n" +
        '// a comment\u{2028}that a line separator does not end\n' +
        '\u{3000}(walk)-[:STARTS_AT]->(home),\x1d(bus)-[:FOLLOWS]->(walk)',
    ),
    fence(
      "//\u{180e}graph:\xa0ws\n\u{180e}MATCH\u{2000}(w:Leg {id: 'walk'})\n\x1fSET\u{205f}w.note\u{202f}=\u{1680}'checked'",
    ),
  ].join('\n'),
  'a byte-order mark or U+0085 opening an item, which is left out': [
    fence("// graph: ws\n(home:Place {name: 'Home'}),\n(walk:Leg {name: 'Walk'}),\u{feff}(walk)-[:STARTS_AT]->(home)"),
    fence("// graph: ws\n(bus:Leg {name: 'Bus'}),\x85(bus)-[:FOLLOWS]->(walk),\n(train:Leg {name: 'Train'})"),
  ].join('\n'),
  'U+2029 and U+180E inside strings, NBSP and U+2028 between items, NBSP, U+2028 and U+2029 before keywords': [
    fence(
      "// graph: ws\n(home:Place {name: 'Home\u{2029}again'}),\xa0(walk:Leg {name: 'twenty-two characters\u{180e}after'})," +
        '\u{2028}(walk)-[:STARTS_AT]->(home)',
    ),
    fence(
      "// graph: ws\n\xa0MATCH (w:Leg {id: 'walk'})\n\u{2029}INSERT (bus:Leg {name: 'Bus'}),\n(bus)-[:FOLLOWS]->(w)\n" +
        "\u{2028}SET w.note = 'checked'",
    ),
  ].join('\n'),
};

test('whitespace as GQL names it is read and drawn the same by both readers, byte for byte', () => {
  same(WHITESPACE);
});
