// Writing from the edit pane to the note (spec §4, §9): what is typed reaches the note quickly, never overwrites a block
// changed meanwhile, is never lost, and can be undone; a draft offers Lock the graph; a graph naming a shared schema reads
// in its words.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { READER, NOTE, PATH, open, textarea, type, note } from './host/pane-notes.js';

before(() => build());

describe('writing to the note', () => {
  test('what is typed reaches the note within about a third of a second', async () => {
    const env = await open();
    try {
      // a timer of the pane's own wait before writing, 150 ms, set just before typing, so it runs just before the pane's:
      // however late a busy machine runs timers, it runs this one as late, so the third of a second is held to that
      // lateness, never to a fixed number of milliseconds alone. Set after typing, it ran after the pane's, and the
      // writing's own work made it late too, so a slow write excused itself (the review of #40, 10 Oct 2026)
      const t0 = Date.now();
      let timer = 0;
      setTimeout(() => (timer = Date.now() - t0), 150);
      type(env.el, READER + ",\n(price:Reason {title: 'Costs more'})");
      while (note(env) === NOTE && Date.now() - t0 < 5000) await wait(10);
      const took = Date.now() - t0;
      while (!timer) await wait(10);
      assert.ok(took <= 350 + (timer - 150), `${took} ms, with timers running ${timer - 150} ms late`);
      assert.equal(note(env), NOTE.replace(READER, READER + ",\n(price:Reason {title: 'Costs more'})"));
    } finally {
      env.uninstall();
    }
  });

  test('a block changed in the note meanwhile is never overwritten: the pane reloads it and keeps what was typed as a draft', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(mine:Reason)');
      const theirs = NOTE.replace(READER, READER + ',\n(theirs:Reason)');
      await env.app.vault.modify({ path: PATH }, theirs);
      await wait(400);
      assert.equal(note(env), theirs, 'not overwritten');
      assert.equal(textarea(env.el).value, READER + ',\n(theirs:Reason)', 'reloaded');
      const banner = env.el.querySelector('.graph-note-draft');
      assert.match(banner.textContent, /kept as a draft/);
      assert.deepEqual(
        Object.values(env.state.data.drafts).map((d) => d.text),
        [READER + ',\n(mine:Reason)'],
      );
      labelled(banner, 'Restore draft').click();
      assert.equal(textarea(env.el).value, READER + ',\n(mine:Reason)');
    } finally {
      env.uninstall();
    }
  });

  test('a draft kept from before is offered when the pane opens on its block again', async () => {
    const env = await open({
      data: { drafts: { [`${PATH}#reader`]: { text: READER + ',\n(mine:Reason)', kept: '2026-10-07T22:00:00.000Z' } } },
    });
    try {
      const banner = env.el.querySelector('.graph-note-draft');
      assert.ok(!banner.hidden);
      labelled(banner, 'Discard draft').click();
      assert.deepEqual(env.state.data.drafts, {});
      assert.ok(banner.hidden);
    } finally {
      env.uninstall();
    }
  });

  test('a change to the note under a clean pane reloads it', async () => {
    const env = await open();
    try {
      const theirs = NOTE.replace(READER, READER + ',\n(theirs:Reason)');
      await env.app.vault.modify({ path: PATH }, theirs);
      await wait(20);
      assert.equal(textarea(env.el).value, READER + ',\n(theirs:Reason)');
    } finally {
      env.uninstall();
    }
  });

  test('Undo and Redo take back and put back each change in the note', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(one:Reason)');
      await wait(400);
      type(env.el, READER + ',\n(one:Reason),\n(two:Reason)');
      await wait(400);
      labelled(env.el, 'Undo').click();
      await wait(20);
      assert.equal(note(env), NOTE.replace(READER, READER + ',\n(one:Reason)'));
      labelled(env.el, 'Undo').click();
      await wait(20);
      assert.equal(note(env), NOTE);
      assert.equal(textarea(env.el).value, READER);
      labelled(env.el, 'Redo').click();
      await wait(20);
      assert.equal(note(env), NOTE.replace(READER, READER + ',\n(one:Reason)'));
    } finally {
      env.uninstall();
    }
  });
});

describe('Lock the graph', () => {
  test('a draft offers Lock the graph, which writes its schema into the note after the graph', async () => {
    const env = await open();
    try {
      const lock = labelled(env.el, 'Lock the graph');
      assert.ok(lock);
      lock.click();
      await wait(50);
      assert.match(
        note(env),
        /```\n\n```gql\n\/\/ graph: reader\n\/\/ ── The schema: locked \d{4}-\d\d-\d\d from the data above ──/,
      );
      assert.equal(labelled(env.el, 'Lock the graph'), undefined, 'a locked graph is no longer offered it');
    } finally {
      env.uninstall();
    }
  });
});

describe('shared schemas', () => {
  const SCHEMA_NOTE =
    "# Schemas\n\n```gql\n// graph: shared · SCHEMA seeing@1\n(t1:Meta:ElementType {name: 'Thing', kind: 'node'}),\n(t2:Meta:ElementType {name: 'SEES', kind: 'edge', reading: 'can see', reverse_name: 'is seen by'})\n```\n";
  const USES = fence(
    "// graph: view · schema seeing@1\n(a:Thing {name: 'A'}), (b:Thing {name: 'B'}), (a)-[:SEES]->(b)",
  );

  test('a graph that names a shared schema reads its links in that schema’s words, in the note and in the pane', async () => {
    const env = await load({ files: { 'Schemas.md': SCHEMA_NOTE, 'View.md': USES } });
    try {
      const el = env.doc.body.createDiv();
      const lines = USES.split('\n');
      const { fakeContext } = await import('./host/fake-obsidian.js');
      await env.state.processors.get('gql')(lines.slice(1, -1).join('\n'), el, {
        ...fakeContext(USES, 0),
        sourcePath: 'View.md',
      });
      assert.match(el.querySelector('g.edge').textContent, /can see/);
      await env.plugin.openEditor({ path: 'View.md', line: 0, graph: 'view' });
      const pane = env.app.workspace.getLeavesOfType('graph-note-pane')[0].view.contentEl;
      assert.ok(pane.querySelectorAll('.graph-note-readback').some((s) => /A can see B/.test(s.textContent)));
    } finally {
      env.uninstall();
    }
  });

  test('a graph that names no shared schema never reads the vault for one', async () => {
    const env = await load({ files: { 'Schemas.md': SCHEMA_NOTE, 'Reader.md': NOTE } });
    try {
      let reads = 0;
      const read = env.app.vault.cachedRead;
      env.app.vault.cachedRead = async (f) => {
        reads++;
        return read(f);
      };
      await env.plugin.openEditor({ path: PATH, line: 2, graph: 'reader' });
      assert.equal(reads, 0);
    } finally {
      env.uninstall();
    }
  });
});
