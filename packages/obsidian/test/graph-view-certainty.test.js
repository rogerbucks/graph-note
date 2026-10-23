// Certainty on a drawing (editor spec §36, certainty_drawn). A thing whose certainty is written gets its level's line
// weight, dash and a mark in words. Its level is said to screen readers. It is never shown by colour alone.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { PATH, show } from './host/card-notes.js';

before(() => build());

const GRAPH = `// graph: weather
(rain:Claim {text: 'It will rain', likelihood: 'almost-certain'}),
(snow:Claim {text: 'It will snow', likelihood: 'unlikely'}),
(fog:Claim {text: 'It will be foggy', status: 'contested'}),
(sun:Claim {text: 'The sun will rise'})`;
const noteOf = (block) => ['# Weather', '', fence(block), ''].join('\n');
const nodeOf = (el, key) => el.querySelectorAll('g.node').find((n) => n.getAttribute('data-key') === key);
const strokes = (g) => g.querySelectorAll('path, polygon, ellipse').map((s) => s.getAttribute('stroke-dasharray'));

describe('certainty, drawn', () => {
  test('each level has its own line and a mark in words, and is said to screen readers', async () => {
    const env = await load({ files: { [PATH]: noteOf(GRAPH) } });
    try {
      const el = await show(env);
      const rain = nodeOf(el, 'rain'),
        snow = nodeOf(el, 'snow'),
        fog = nodeOf(el, 'fog');
      assert.equal(rain.getAttribute('data-style'), 'thing.certainty.sure');
      assert.ok(
        strokes(rain).every((d) => d === null),
        'the surest is solid',
      );
      assert.ok(strokes(snow).includes('5 3'), 'doubtful is dashed');
      assert.ok(strokes(fog).includes('2 2'), 'contested is dotted');
      assert.ok(snow.querySelectorAll('text').some((t) => /doubtful/.test(t.textContent)));
      assert.ok(fog.querySelectorAll('text').some((t) => /contested/.test(t.textContent)));
      assert.match(fog.getAttribute('aria-label'), /contested/i);
      assert.ok(
        !nodeOf(el, 'sun').classList.contains('thoughtknot-certainty'),
        'a thing with no certainty is as before',
      );
    } finally {
      env.uninstall();
    }
  });
});
