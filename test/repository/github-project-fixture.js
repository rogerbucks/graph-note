// A small requirements copy and workstreams map that the GitHub mirror's tests share. Test code only — nothing here
// ships. Hand-made small graphs stand in for the real file, so each rule is seen on a case that shows it.
export const FIXTURE = `// graph: editor_requirements · SOURCE
// The editor's requirements graph, the one source: edit it here, in a pull request. A test only moves forward.
// ── Sections ──
(section_3:Section {num: '3', title: 'Viewing'}),
(section_24:Section {num: '24', title: 'Viewer aids'}),
// ── Requirements ──
(zoom_out_to_fit:Requirement {section: '3', slice: 3, level: 'must', rule: 'Zoom out must fit the drawing, however large it is.'}),
(focus_neighbours:Requirement {section: '3', slice: 3, level: 'should', rule: 'Choosing a thing should dim all but its neighbours; the rest stays drawn.'}),
(focus_link:Requirement {section: '3', slice: 4, level: 'must', rule: 'Choosing a link must show it.'}),
(done_means_proved:Requirement {section: '24', slice: 3, level: 'must', rule: 'A slice is done only when every requirement of it is proved by a test.'}),
(stray_new:Requirement {section: '24', slice: 4, level: 'must', rule: 'A requirement nobody has filed under a workstream yet.'}),
(old_thing:Requirement {section: '3', slice: 2, level: 'must', rule: 'An old rule, in a slice not chosen.'}),
// ── Tests ──
(test_done:Test {proves: 'zoom out fits\\nthe drawing', file: 'test/zoom.test.js, test/fit.test.js', where: 'repo', status: 'written'}),
(test_done_too:Test {proves: 'a second proof', file: 'test/two.test.js', where: 'repo', status: 'written'}),
(test_later:Test {proves: 'a planned proof', file: 'test/later.test.js', where: 'repo', status: 'planned'}),
(test_away:Test {proves: 'kept elsewhere', where: 'outside the repo', status: 'written'}),
// ── Links ──
(zoom_out_to_fit)-[:PROVED_BY]->(test_done),
(zoom_out_to_fit)-[:PROVED_BY]->(test_done_too),
(focus_neighbours)-[:PROVED_BY]->(test_done),
(focus_neighbours)-[:PROVED_BY]->(test_later),
(focus_link)-[:PROVED_BY]->(test_later),
(old_thing)-[:PROVED_BY]->(test_away)
`;

export const WORKSTREAMS = {
  W0: { title: 'Zoom', requirements: ['zoom_out_to_fit', 'not_in_this_copy'] },
  W1: { title: 'Focus, hover and untangle', requirements: ['focus_neighbours', 'focus_link'] },
  S3: { title: 'Slice end', requirements: ['done_means_proved'] },
};

/** The same copy with open questions: two in the chosen slices, one outside them, and what each blocks. */
export const FIXTURE_WITH_QUESTIONS = `${FIXTURE.trimEnd()},
// ── Questions ──
(q_01_ai_interface:Question {num: 'Q-01', slice: 3, text: 'Which interface do external AI tools use to query the graph? Ask @alice about #12.'}),
(q_02_listed:Question {num: 'Q-02', slice: 4, text: 'A question a workstream lists.'}),
(q_03_old:Question {num: 'Q-03', slice: 2, text: 'An old question, in a slice not chosen.'}),
(q_01_ai_interface)-[:BLOCKS]->(zoom_out_to_fit),
(q_01_ai_interface)-[:BLOCKS]->(focus_link)
`;

/** The workstreams with the open-questions workstream, and one question listed elsewhere. */
export const WORKSTREAMS_WITH_QUESTIONS = {
  ...WORKSTREAMS,
  W1: { title: 'Focus, hover and untangle', requirements: ['focus_neighbours', 'focus_link', 'q_02_listed'] },
  Q: { title: 'Open questions', requirements: [] },
};

/**
 * A waves plan for the fixture: W1 first, then the slice-end workstream, whose listed requirement comes before the one it
 * holds by default. W0 is in no wave; its one requirement in the copy is proved.
 */
export const WAVES = {
  about: 'A plan for the tests.',
  waves: [
    { title: 'Wave 1 · Focus', start: '2026-10-20', end: '2026-11-02', estimate: true, workstreams: ['W1'] },
    { title: 'Wave 2 · Slice end', start: '2026-11-03', end: '2026-11-16', estimate: false, workstreams: ['S3'] },
  ],
};
