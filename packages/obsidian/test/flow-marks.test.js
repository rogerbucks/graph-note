// Links that move in a drawing (editor spec §7, §11): the links a style graph's Flow moves are marked for the plugin's
// styles to run their dashes or a dot along them (links_show_flow), each named for a screen reader with its movement and
// what it means, and the card's legend saying each in words beside its icon (motion_not_alone); a view moves its own,
// and no link moves without a Flow (flow_in_style_graph); under reduced motion no dot runs (motion_reduced_respected).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show, styles } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(cafe)-[:SERVES]->(park)`;
const STYLE = (...lines) => ['// graph: trip_style · STYLE trip', ...lines].join('\n');
const noteOf = (...blocks) => ['# Trip', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const linkOf = (el, n) => el.querySelectorAll('g.edge').find((g) => g.getAttribute('data-link') === String(n));

async function drawn(note, options = {}) {
  const env = await load({ files: { [PATH]: note } });
  if (options.reduce)
    env.doc.defaultView.matchMedia = (q) => ({ media: q, matches: q === '(prefers-reduced-motion: reduce)' });
  const { el } = await show(env, note);
  return { env, el };
}

describe('the links a Flow moves', () => {
  // proves: links_show_flow, flow_in_style_graph
  test('are marked to move as dashes or a dot, and no other link is', async () => {
    const { env, el } = await drawn(
      noteOf(
        TRIP,
        STYLE(
          "(f1:Flow {motion: 'dashes', type: 'NEAR', means: 'people walk this way'}),",
          "(f2:Flow {motion: 'dot', type: 'SERVES', means: 'coffee goes this way'})",
        ),
      ),
    );
    try {
      const near = linkOf(el, 0),
        serves = linkOf(el, 1);
      assert.ok(near.classList.contains('graph-note-flow') && near.classList.contains('graph-note-flow-dashes'));
      assert.ok(serves.classList.contains('graph-note-flow-dot'));
      // a dot runs along a copy of the link's line, so the line itself is still drawn
      const runners = serves.querySelectorAll('path').filter((p) => p.classList.contains('graph-note-flow-runner'));
      assert.equal(runners.length, 1);
      assert.equal(runners[0].getAttribute('pathLength'), '100');
      assert.equal(near.querySelectorAll('.graph-note-flow-runner').length, 0, 'dashes need no runner');
    } finally {
      env.uninstall();
    }
  });

  // proves: flow_in_style_graph
  test('with no Flow, no link moves and the card has no legend of movement', async () => {
    const { env, el } = await drawn(noteOf(TRIP));
    try {
      assert.equal(el.querySelectorAll('.graph-note-flow').length, 0);
      assert.equal(el.querySelectorAll('.graph-note-flow-runner').length, 0);
      assert.equal(el.querySelector('.graph-note-flow-legend'), null);
    } finally {
      env.uninstall();
    }
  });
});

describe('movement is never the only signal', () => {
  // proves: motion_not_alone
  test('each moving link is named with its movement and what it means, and the legend says each beside its icon', async () => {
    const { env, el } = await drawn(noteOf(TRIP, STYLE("(f1:Flow {motion: 'dashes', means: 'people walk this way'})")));
    try {
      assert.equal(
        linkOf(el, 0).getAttribute('aria-label'),
        'Link: Home near The park, moving dashes: people walk this way',
      );
      const legend = el.querySelector('.graph-note-flow-legend');
      assert.ok(legend, 'a legend of what moves');
      assert.equal(legend.getAttribute('aria-label'), 'What the moving links mean');
      assert.deepEqual(
        legend.querySelectorAll('li').map((li) => li.textContent),
        ['⇢ moving dashes: people walk this way'],
      );
    } finally {
      env.uninstall();
    }
  });
});

describe('under reduced motion', () => {
  // proves: motion_reduced_respected
  test('the styles hide every dot, and the links keep their icon, their words and the legend', async () => {
    const { env, el } = await drawn(noteOf(TRIP, STYLE("(f1:Flow {motion: 'dot', means: 'coffee goes this way'})")), {
      reduce: true,
    });
    try {
      // the dot is drawn whatever the setting, so turning reduced motion off later moves it at once; the styles hide it
      assert.equal(el.querySelectorAll('.graph-note-flow-runner').length, 2);
      const css = styles.replace(/\/\*[\s\S]*?\*\//g, '');
      const still = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
      assert.match(still, /\.graph-note-svg path\.graph-note-flow-runner[^{]*\{\s*display: none;/);
      assert.match(linkOf(el, 1).getAttribute('aria-label'), /a moving dot: coffee goes this way$/);
      assert.ok(el.querySelector('.graph-note-flow-legend'));
    } finally {
      env.uninstall();
    }
  });
});

describe('a link guessed from a near miss of its type', () => {
  // proves: links_show_flow, motion_not_alone
  test('moves as the type it is taken for, and is named with its movement', async () => {
    const guessed = `${TRIP},\n(park)-[:NEAR]->(cafe),\n(cafe)-[:NEER]->(home)`;
    const { env, el } = await drawn(
      noteOf(guessed, STYLE("(f1:Flow {motion: 'dot', type: 'NEAR', means: 'people walk this way'})")),
    );
    try {
      const g = el.querySelectorAll('g.edge').find((e) => e.getAttribute('id') === 'edge4');
      assert.ok(g.getAttribute('data-estimate') !== null, 'the misspelt link is drawn as a guess, with no data-link');
      assert.ok(g.classList.contains('graph-note-flow-dot'));
      assert.match(g.getAttribute('aria-label'), /, a moving dot: people walk this way$/);
      assert.equal(g.querySelectorAll('path').filter((p) => p.classList.contains('graph-note-flow-runner')).length, 1);
    } finally {
      env.uninstall();
    }
  });
});
