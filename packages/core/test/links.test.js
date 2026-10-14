// Links and attachments (editor spec §18): every kind of link written in a graph is found, shown as a link, opened by the
// host and kept safe; a thing's attachments are counted and listed; a link that names nothing is drawn as broken and
// reported with its fix; and a renamed note or file is followed by every link to it inside graph blocks, never in prose.
// The core's part is tested on its own first; then the built Obsidian plugin, loaded against its stand-ins, shows that the
// host does the opening, the previewing and the going back (host_opens_links, link_preview, back_where_you_were).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import {
  attachmentsOf,
  brokenLinks,
  leavingWords,
  linkKind,
  linksIn,
  linksHeld,
  noteOf,
  renamedLinks,
  applyChanges,
  safeMarkdown,
  withMeant,
} from '../src/links.ts';

const fence = (t) => '```gql\n' + t + '\n```';

/** A graph whose things hold every kind of link. */
const TRIP = `// graph: trip
(plan:Doc {name: 'Plan', see: '[[Plans|the plans]] and [[Budget#Costs]]', files: '![[photo.png]], [[report.pdf]]'}),
(site:Place {name: 'Site', url: 'Book at https://example.com/rooms.', mail: 'mailto:desk@example.com'}),
(note:Doc {id: '[[Trip plan]]'}),
(plan)-[:CITES {where: '[the map](Maps/Map.md)'}]->(site)`;

describe('every kind of link is found (links_shown)', () => {
  test('wikilinks with an alias or a heading, embeds, Markdown links and images, and bare web and mail addresses', () => {
    const text =
      'See [[Plans|the plans]], [[Budget#Costs]], ![[photo.png]], [map](Maps/My%20Map.md), ![c](https://x.org/c.png) and https://example.com/a, or mailto:me@example.org.';
    const found = linksIn(text);
    assert.deepEqual(
      found.map((l) => [l.written, l.target, l.label, l.embed, l.kind]),
      [
        ['[[Plans|the plans]]', 'Plans', 'the plans', false, 'note'],
        ['[[Budget#Costs]]', 'Budget', 'Budget#Costs', false, 'note'],
        ['![[photo.png]]', 'photo.png', 'photo.png', true, 'file'],
        ['[map](Maps/My%20Map.md)', 'Maps/My Map.md', 'map', false, 'note'],
        ['![c](https://x.org/c.png)', 'https://x.org/c.png', 'c', true, 'web'],
        ['https://example.com/a', 'https://example.com/a', 'https://example.com/a', false, 'web'],
        ['mailto:me@example.org', 'mailto:me@example.org', 'mailto:me@example.org', false, 'mail'],
      ],
    );
    for (const l of found) assert.equal(text.slice(l.start, l.end), l.written, 'each where it is written');
    assert.equal(found[1].opens, 'Budget#Costs', 'the host is handed the heading too');
  });

  test('plain text has none, and text full of openers that never close is read once through, finding none', () => {
    assert.deepEqual(linksIn('Nothing [here] (at all) — not even http:/ or [[ ]]'), []);
    assert.deepEqual(linksIn('[['.repeat(100000) + ']'), []);
    assert.deepEqual(linksIn('[a]('.repeat(100000)), []);
  });
});

describe('only notes, files and web and mail addresses may be opened (safe_to_click)', () => {
  test('a note, a file, a web address and a mail address', () => {
    assert.equal(linkKind('Plans'), 'note');
    assert.equal(linkKind('Folder/Plans.md'), 'note');
    assert.equal(linkKind('Meeting 2026.10.15'), 'note', 'a dot in a note’s name is not an extension');
    assert.equal(linkKind('scans/photo.PNG'), 'file');
    assert.equal(linkKind('HTTPS://example.com'), 'web');
    assert.equal(linkKind('mailto:me@example.org'), 'mail');
  });

  test('any other scheme is refused, however it is disguised', () => {
    for (const t of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'javascript&#58;alert(1)',
      'javascript&#x3A;alert(1)',
      'javascript&colon;alert(1)',
      'data:text/html,<b>x</b>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'obsidian://open?vault=x',
      '//evil.example.com/x',
      'C:\\Windows\\x.exe',
      '&#106;avascript:alert(1)',
      '&#x6A;avascript:alert(1)',
      '&#32;javascript:alert(1)',
    ])
      assert.equal(linkKind(t), 'refused', t);
    assert.equal(linksIn('[x](%6Aavascript:alert(1))')[0]?.kind, 'refused', 'a scheme percent-encoded');
  });

  test('a link that leaves Obsidian is said so plainly before it is opened; one in the vault is not', () => {
    const [web, mail, note] = linksIn('https://example.com/a mailto:me@example.org [[Plans]]');
    assert.equal(leavingWords(web), 'This link leaves Obsidian: it opens https://example.com/a in your web browser.');
    assert.equal(leavingWords(mail), 'This link leaves Obsidian: it writes to me@example.org in your mail app.');
    assert.equal(leavingWords(note), null);
  });

  test('Markdown for the host to render loads nothing remote, runs no script and holds no HTML', () => {
    assert.equal(safeMarkdown('A ![chart](https://x.org/c.png) here'), 'A [chart](https://x.org/c.png) here');
    assert.equal(safeMarkdown('Ref ![chart][c]'), 'Ref [chart][c]', 'a reference image could be remote');
    assert.equal(safeMarkdown('![[photo.png]] and ![local](scans/a.png)'), '![[photo.png]] and ![local](scans/a.png)');
    assert.equal(safeMarkdown('![[https://x.org/c.png]]'), '[[https://x.org/c.png]]');
    assert.equal(
      safeMarkdown('<img src="https://x.org/t.gif"> <b>bold</b>'),
      '[https://x.org/t.gif](https://x.org/t.gif) &lt;b>bold&lt;/b>',
      'an HTML image is a link to it, never loaded; other HTML is text',
    );
    assert.equal(safeMarkdown('[run](javascript:alert(1))'), '\\[run](javascript:alert(1))');
    assert.equal(
      safeMarkdown('Code `<b>` and `![x](https://x.org)` stays'),
      'Code `<b>` and `![x](https://x.org)` stays',
    );
    assert.equal(safeMarkdown('```\n<b>fenced</b>\n```\n<i>'), '```\n<b>fenced</b>\n```\n&lt;i>');
    assert.equal(safeMarkdown('Maths $E = mc^2$ and a < b'), 'Maths $E = mc^2$ and a < b');
  });
});

describe('links and attachments of a thing (links_shown, attachments_at_a_glance)', () => {
  const reading = readNote([TRIP]);

  test('every link in its properties, by property, and a relationship’s own', () => {
    assert.deepEqual(
      linksHeld(reading, 'trip', { thing: 'plan' }).map((p) => [p.property, p.link.target]),
      [
        ['files', 'photo.png'],
        ['files', 'report.pdf'],
        ['see', 'Plans'],
        ['see', 'Budget'],
      ],
    );
    assert.deepEqual(
      linksHeld(reading, 'trip', { link: 0 }).map((p) => [p.property, p.link.target]),
      [['where', 'Maps/Map.md']],
    );
  });

  test('its attachments: the files it links, by name and type, each once', () => {
    assert.deepEqual(attachmentsOf(reading, 'trip', 'plan'), [
      { name: 'photo.png', type: 'image', target: 'photo.png' },
      { name: 'report.pdf', type: 'PDF', target: 'report.pdf' },
    ]);
    assert.deepEqual(attachmentsOf(reading, 'trip', 'site'), [], 'web and mail addresses are no attachments');
  });

  test('a thing whose id is a link to a note stands for that note (node_is_a_note)', () => {
    assert.equal(noteOf(reading, 'trip', '[[Trip plan]]')?.target, 'Trip plan');
    assert.equal(noteOf(reading, 'trip', 'plan'), null);
  });

  test('a thing whose id is a global note id, note: and the note’s name, stands for that note (graph spec §10)', () => {
    const ids = readNote([
      "// graph: spec\n(m:Doc {id: 'note:Graph spec model'}),\n(r:Doc {id: 'note:report.pdf'}),\n(e:Doc {id: 'note:'})",
    ]);
    const note = noteOf(ids, 'spec', 'note:Graph spec model');
    assert.deepEqual(
      [note?.target, note?.opens, note?.label, note?.kind, note?.written],
      ['Graph spec model', 'Graph spec model', 'Graph spec model', 'note', 'note:Graph spec model'],
    );
    assert.equal('note:Graph spec model'.slice(note.targetAt.start, note.targetAt.end), 'Graph spec model');
    assert.equal(noteOf(ids, 'spec', 'note:report.pdf'), null, 'a file is no note');
    assert.equal(noteOf(ids, 'spec', 'note:'), null, 'a note needs its name');
  });

  test('a global note id that names no note is broken, with its fix', () => {
    const ids = readNote(["// graph: spec\n(m:Doc {id: 'note:Graph spec modle'})"]);
    const [broken] = brokenLinks(ids, 'spec', { found: () => false, names: ['Graph spec model'] });
    assert.equal(broken?.problem.fix, 'Create the note Graph spec modle, or change it to [[Graph spec model]].');
    assert.deepEqual(broken?.problem.span, { line: 1, character: 18, end: 34 });
  });
});

describe('a link that names nothing is broken, with its fix (broken_links_problems)', () => {
  const block = `// graph: trip
(plan:Doc {name: 'Plan', see: '[[Plnas]] and [[Budget]]', pic: '![[photo.jpg]]', web: 'https://example.com'})`;
  const reading = readNote([block]);
  const vault = { found: (t) => t === 'Budget', names: ['Plans', 'Budget', 'photo.png', 'Other'] };

  test('each is reported where it is written, with the note to create or the name it most likely meant', () => {
    const broken = brokenLinks(reading, 'trip', vault);
    assert.deepEqual(
      broken.map((b) => [b.link.target, b.meant, b.problem.severity, b.problem.line, b.problem.span]),
      [
        ['photo.jpg', ['photo.png'], 'warning', 2, { line: 1, character: 67, end: 76 }],
        ['Plnas', ['Plans'], 'warning', 2, { line: 1, character: 33, end: 38 }],
      ],
    );
    const [pic, plan] = broken;
    assert.equal(plan.problem.message, '[[Plnas]] names no note or file in the vault, so it is drawn as broken.');
    assert.equal(plan.problem.fix, 'Create the note Plnas, or change it to [[Plans]].');
    assert.equal(pic.problem.fix, 'Put photo.jpg in the vault, or change it to [[photo.png]].');
    assert.deepEqual(plan.problem.replace, { written: 'Plnas', with: ['Plans'] });
  });

  test('picking what it meant writes it in place of what was written, and nothing else', () => {
    const [, plan] = brokenLinks(reading, 'trip', vault);
    assert.equal(withMeant(block, plan, 'Plans'), block.replace('[[Plnas]]', '[[Plans]]'));
  });

  test('with nothing near, the fix is to create the note alone', () => {
    const broken = brokenLinks(reading, 'trip', { found: () => false, names: [] });
    assert.equal(broken.find((b) => b.link.target === 'Plnas')?.problem.fix, 'Create the note Plnas.');
    assert.equal(broken.length, 3, 'a web address is never broken in the vault');
  });

  test('one link written many times is found at each place in turn, and what it meant is worked out once', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `(t${i}:Doc {see: '[[Plnas]]'})`);
    const many = readNote([`// graph: trip\n${lines.join(',\n')}`]);
    let asked = 0;
    const names = new Proxy(['Plans'], {
      get: (t, k) => {
        if (k === Symbol.iterator || k === 'filter') asked++;
        return Reflect.get(t, k);
      },
    });
    const broken = brokenLinks(many, 'trip', { found: () => false, names });
    assert.deepEqual(
      broken.map((b) => b.problem.line),
      lines.map((_, i) => i + 2),
    );
    assert.equal(asked, 1, 'the names looked through once for the one target');
  });
});

describe('renames follow inside graph blocks, never in prose (renames_follow)', () => {
  const block = `// graph: trip
(plan:Doc {see: '[[Plans]], [[Plans|the plans]], [[Projects/Plans.md#Costs]]', map: '[m](Plans.md)'}),
// see [[Plans]]
(other:Doc {see: '[[Plans and more]]'})`;
  const note = ['Prose links [[Plans]] stay.', '', fence(block), '', 'And [[Plans]] here.'].join('\n');

  test('every link to the renamed note in a block is rewritten, keeping its alias, heading and form', () => {
    const changed = applyChanges(note, renamedLinks(note, 'Projects/Plans.md', 'Projects/Trip plans.md'));
    assert.equal(
      changed,
      [
        'Prose links [[Plans]] stay.',
        '',
        fence(`// graph: trip
(plan:Doc {see: '[[Trip plans]], [[Trip plans|the plans]], [[Projects/Trip plans.md#Costs]]', map: '[m](Trip%20plans.md)'}),
// see [[Trip plans]]
(other:Doc {see: '[[Plans and more]]'})`),
        '',
        'And [[Plans]] here.',
      ].join('\n'),
    );
  });

  test('a link that still finds another file is left; a new name a block cannot hold is left, to be reported broken', () => {
    assert.deepEqual(
      renamedLinks(note, 'Projects/Plans.md', 'Projects/Trip plans.md', () => true),
      [],
      'it still names a file',
    );
    assert.deepEqual(renamedLinks(note, 'Projects/Plans.md', "Projects/Roger's plans.md"), []);
  });

  test('a new name holding a percent sign is written percent-encoded first, where a Markdown link writes it', () => {
    const changed = applyChanges(note, renamedLinks(note, 'Projects/Plans.md', 'Projects/100% plans.md'));
    assert.ok(changed.includes("map: '[m](100%25%20plans.md)'"), changed);
    assert.ok(changed.includes("see: '[[100% plans]]"), 'a wikilink is written as the name is');
    const written = "// graph: t\n(p:Doc {see: '[x](100%25%20plna)'})";
    const [plan] = brokenLinks(readNote([written]), 't', { found: () => false, names: ['100% plan'] });
    assert.deepEqual(plan?.problem.replace, { written: '100%25%20plna', with: ['100%25%20plan'] });
    assert.equal(withMeant(written, plan, '100% plan'), "// graph: t\n(p:Doc {see: '[x](100%25%20plan)'})");
  });

  test('a rename into another folder writes the new path where a link was written as a path', () => {
    const changes = renamedLinks(note, 'Projects/Plans.md', 'Archive/Plans.md');
    assert.ok(applyChanges(note, changes).includes('[[Archive/Plans.md#Costs]]'));
    assert.ok(
      applyChanges(note, changes).includes("see: '[[Plans]], [[Plans|the plans]]"),
      'a name alone still finds it',
    );
  });
});

// The host's part, in the built Obsidian plugin against its stand-ins: what the plugin hands Obsidian, and when.
describe('in Obsidian', () => {
  const PATH = 'Some note.md';
  const GRAPH = `// graph: trip
(plan:Doc {name: 'Plan [[Plans]]', see: '[[Plans]] and https://example.com/a', files: '![[photo.png]], [[report.pdf]]', bad: '[run](javascript:alert(1))', gone: '[[Plnas]]', wiki: '[[javascript:alert(2)]]'}),
(site:Place {name: 'Go [x](javascript:y)'}),
(plan)-[:NEAR]->(site)`;
  const NOTE = ['# Trip [[Plans]]', '', fence(GRAPH), ''].join('\n');
  const FILES = { [PATH]: NOTE, 'Plans.md': '# Plans', 'photo.png': '', 'report.pdf': '' };
  let host;
  const setUp = async (options = {}) => {
    host ??= {
      ...(await import('../../obsidian/test/host/load-plugin.js')),
      ...(await import('../../obsidian/test/host/card-notes.js')),
      ...(await import('../../obsidian/test/host/inspector-steps.js')),
      ...(await import('../../obsidian/test/host/notes.js')),
      ...(await import('../../obsidian/test/host/pane-notes.js')),
      ...(await import('../../obsidian/test/host/editing-view.js')),
    };
    if (!host.built) host.build();
    host.built = true;
    return host.load({ files: { ...FILES }, ...options });
  };
  /** The card, drawn, with the details of `key` open. */
  const card = async (env, key = 'plan') => {
    const el = await host.show(env);
    await host.until(() => !!el.querySelector('g.node'));
    if (key) host.tapKey(el, key);
    return el;
  };
  /** A link in the details' list of the links a thing holds. */
  const anchor = (el, words) =>
    el.querySelectorAll('.graph-note-link-list a').find((a) => a.textContent === words) ??
    assert.fail(`a link ${words}`);
  const press = (el, words) =>
    el.querySelectorAll('button').find((b) => b.textContent === words) ?? assert.fail(`a button ${words}`);

  test('a link is shown as a link in a box, with a paperclip counting the thing’s attachments (links_shown, attachments_at_a_glance)', async () => {
    const env = await setUp();
    try {
      const el = await card(env, null);
      const box = el.querySelector('g.node[data-key="plan"]');
      assert.ok(
        box.querySelectorAll('text').some((t) => t.hasClass('graph-note-link') && t.textContent.includes('[[Plans]]')),
      );
      assert.equal(box.querySelector('text.graph-note-attachments')?.textContent, '📎 2');
      assert.match(box.getAttribute('aria-label'), /2 attachments/);
      assert.equal(el.querySelector('g.node[data-key="site"] text.graph-note-attachments'), null);
      assert.deepEqual(
        el.querySelectorAll('g.node[data-key="site"] text.graph-note-link').map((t) => t.textContent),
        [],
        'a link that is never opened is never drawn as one',
      );
    } finally {
      env.uninstall();
    }
  });

  test('on the card, each link is a link, each attachment listed by name and type, and a refused one only text', async () => {
    const env = await setUp();
    try {
      const el = await card(env);
      for (const w of ['Plans', 'https://example.com/a', 'Plnas']) assert.ok(anchor(el, w));
      const files = el.querySelectorAll('.graph-note-attachment-list li').map((li) => li.textContent);
      assert.deepEqual(files, ['photo.png — image', 'report.pdf — PDF']);
      // as written, and as Obsidian rendered it: no link anywhere in the details runs script
      const addresses = el
        .querySelectorAll('.graph-note-details a')
        .map((a) => `${a.getAttribute('href')} ${a.getAttribute('data-href')}`);
      assert.deepEqual(
        addresses.filter((t) => /javascript/i.test(t)),
        [],
      );
      const refused = el.querySelectorAll('.graph-note-link-refused').map((s) => s.textContent);
      assert.ok(
        refused.some((t) => /run.*not opened/.test(t)),
        refused.join(' | '),
      );
      assert.ok(
        refused.some((t) => /alert\(2\)/.test(t)),
        'the one Obsidian rendered, as text',
      );
    } finally {
      env.uninstall();
    }
  });

  test('in the inspector, while the block is edited, the links are links too', async () => {
    const env = await setUp();
    try {
      const el = await host.editing(env);
      host.tapKey(el, 'plan');
      assert.ok(anchor(el, 'Plans'));
      assert.deepEqual(
        el.querySelectorAll('.graph-note-attachment-list li').map((li) => li.textContent),
        ['photo.png — image', 'report.pdf — PDF'],
      );
    } finally {
      env.uninstall();
    }
  });

  test('in the text pane, a link inside a block is marked as one', async () => {
    const env = await setUp();
    try {
      await env.plugin.openEditor({ path: PATH, line: 2, graph: 'trip' });
      const pane = env.app.workspace.getLeavesOfType('graph-note-pane')[0].view.contentEl;
      const marked = pane.querySelectorAll('.graph-note-overlay .graph-note-text-link').map((s) => s.textContent);
      // every link in the block's texts, each marked whole, in the order written
      assert.deepEqual(marked, [
        '[[Plans]]',
        '[[Plans]]',
        'https://example.com/a',
        '![[photo.png]]',
        '[[report.pdf]]',
        '[run](javascript:alert(1)',
        '[[Plnas]]',
        '[[javascript:alert(2)]]',
        '[x](javascript:y)',
      ]);
    } finally {
      env.uninstall();
    }
  });

  test('a link to a note or file is opened by Obsidian’s own link opener; a modifier opens a new tab (host_opens_links)', async () => {
    const env = await setUp();
    try {
      const el = await card(env);
      anchor(el, 'Plans').dispatch('click', { metaKey: true });
      assert.deepEqual(env.state.opened, { link: 'Plans', from: PATH, newLeaf: 'tab' });
      anchor(el, 'photo.png').click();
      assert.deepEqual(env.state.opened, { link: 'photo.png', from: PATH, newLeaf: false });
    } finally {
      env.uninstall();
    }
  });

  test('a web address is said to leave Obsidian before Obsidian opens it, and only once agreed (safe_to_click)', async () => {
    const env = await setUp();
    try {
      const el = await card(env);
      const a = anchor(el, 'https://example.com/a');
      // the address is the plugin's to hand over, never the browser's to follow: no middle-click or menu reaches it
      assert.equal(a.getAttribute('href'), '#');
      assert.equal(a.getAttribute('data-href'), 'https://example.com/a');
      assert.ok(a.dispatch('contextmenu', { button: 2 }).defaultPrevented, 'no menu to open it outside the dialog');
      assert.ok(a.dispatch('auxclick', { button: 1 }).defaultPrevented);
      const asked = env.state.modals.at(-1);
      assert.ok(asked, 'a middle-click asks first too');
      assert.equal(asked.contentEl.querySelector('.graph-note-leave-host')?.textContent, 'example.com');
      assert.match(asked.contentEl.textContent, /This link leaves Obsidian: it opens https:\/\/example\.com\/a/);
      assert.equal(env.doc.opened, undefined, 'nothing opened yet');
      press(asked.contentEl, 'Open').click();
      assert.deepEqual(env.doc.opened, [{ url: 'https://example.com/a', target: '_blank' }]);
    } finally {
      env.uninstall();
    }
  });

  test('every link is reached and opened from the keyboard (links_by_keyboard)', async () => {
    const env = await setUp();
    try {
      const el = await card(env);
      const a = anchor(el, 'Plans');
      assert.ok(a.hasAttribute('href'), 'a link the Tab key reaches');
      assert.ok(a.dispatch('keydown', { key: 'Enter' }).defaultPrevented);
      assert.deepEqual(env.state.opened, { link: 'Plans', from: PATH, newLeaf: false });
    } finally {
      env.uninstall();
    }
  });

  test('hovering a link shows Obsidian’s own preview of it; on a phone, a long press does (link_preview)', async () => {
    const env = await setUp();
    try {
      assert.ok(env.state.hoverSources.has('graph-note'), 'the plugin is a hover source Page preview knows');
      const el = await card(env);
      anchor(el, 'Plans').dispatch('mouseover', { clientX: 5, clientY: 5 });
      assert.equal(env.state.hovered.source, 'graph-note');
      assert.equal(env.state.hovered.linktext, 'Plans');
      assert.equal(env.state.hovered.sourcePath, PATH);
    } finally {
      env.uninstall();
    }
    const phone = await setUp({ mobile: true });
    try {
      const el = await card(phone);
      const a = anchor(el, 'Plans');
      a.dispatch('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 5, clientY: 5 });
      await host.until(() => !!phone.state.hovered);
      assert.equal(phone.state.hovered.linktext, 'Plans');
      a.dispatch('pointerup', { pointerType: 'touch', pointerId: 1 });
      a.click();
      assert.equal(phone.state.opened, undefined, 'the press that showed the preview opens nothing');
    } finally {
      phone.uninstall();
    }
  });

  test('back from a link, the graph is as it was left: the same zoom and selection (back_where_you_were)', async () => {
    const env = await setUp();
    try {
      const el = await card(env);
      host.labelled(el, 'Zoom in').click();
      host.labelled(el, 'Zoom in').click();
      const place = (card) => {
        const vp = card.querySelector('.graph-note-viewport');
        return [
          card.querySelector('svg').getAttribute('width'),
          vp.cssProps['--graph-note-x'],
          vp.cssProps['--graph-note-y'],
        ];
      };
      const left = place(el);
      host.tapKey(el, 'plan');
      anchor(el, 'Plans').click();
      // Obsidian's back step shows the note again, and its block is drawn afresh
      const again = await card(env, null);
      await host.until(() => !again.querySelector('.graph-note-details').hidden);
      assert.deepEqual(place(again), left, 'the same zoom, and panned to the same place');
      assert.equal(again.querySelector('g.node.is-selected')?.getAttribute('data-key'), 'plan');
    } finally {
      env.uninstall();
    }
  });

  test('a link that names nothing is drawn broken, counted as a problem, and fixed by creating the note or picking the one meant (broken_links_problems)', async () => {
    const env = await setUp();
    try {
      const el = await card(env);
      assert.ok(anchor(el, 'Plnas').hasClass('is-unresolved'));
      assert.ok(
        el.querySelectorAll('.graph-note-problems li').some((li) => /\[\[Plnas\]\] names no note/.test(li.textContent)),
      );
      press(el, 'Create the note Plnas').click();
      await host.until(() => env.state.files.has('Plnas.md'));
      press(el, 'Change it to [[Plans]]').click();
      await host.until(() => !env.state.files.get(PATH).includes('[[Plnas]]'));
      assert.ok(env.state.files.get(PATH).includes("gone: '[[Plans]]'"));
    } finally {
      env.uninstall();
    }
  });

  test('a renamed note is followed by every link to it in graph blocks, never in prose; through the editor when open (renames_follow)', async () => {
    const env = await setUp();
    try {
      await env.app.vault.rename(env.app.vault.getFileByPath('Plans.md'), 'Trip plans.md');
      await host.until(() => env.state.files.get(PATH).includes("see: '[[Trip plans]]"));
      assert.ok(env.state.files.get(PATH).startsWith('# Trip [[Plans]]'), 'prose is the host’s own to update');
      const before = env.state.files.get(PATH);
      const view = host.openNote(env, before, PATH);
      await env.app.vault.rename(env.app.vault.getFileByPath('Trip plans.md'), 'Plans.md');
      await host.until(() => view.state.doc.toString().includes("see: '[[Plans]]"));
      assert.ok(env.state.files.get(PATH).includes("see: '[[Trip plans]]"), 'written by the editor, which saves it');
      // one change, which one undo takes back whole
      const made = view.transactions.filter((t) => t.tr.isUserEvent('input.graph-note'));
      assert.equal(made.length, 1);
      assert.equal(made[0].tr.changes.invert(made[0].before).apply(view.state.doc).toString(), before);
    } finally {
      env.uninstall();
    }
  });

  test('a note whose index holds no code block is never read for a rename', async () => {
    const env = await setUp();
    try {
      env.state.files.set('Prose.md', 'Only prose, and [[Plans]].');
      env.state.sections = { 'Prose.md': [{ type: 'paragraph' }], [PATH]: [{ type: 'heading' }, { type: 'code' }] };
      env.state.reads = [];
      await env.app.vault.rename(env.app.vault.getFileByPath('Plans.md'), 'Trip plans.md');
      await host.until(() => env.state.files.get(PATH).includes("see: '[[Trip plans]]"));
      assert.ok(!env.state.reads.includes('Prose.md'), env.state.reads.join(', '));
    } finally {
      env.uninstall();
    }
  });
});
