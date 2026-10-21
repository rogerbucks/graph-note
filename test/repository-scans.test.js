// The source scans the repository policy relies on for the one network exception (spec §13, §19), tested on their own:
// - the AI send module, found however it is reached;
// - Obsidian's older request function, taken for a request;
// - every timer and event found that could send in the background;
// - the list of the network's calls a plug-in's worker takes away, which is not a request (TRUST-14).
// test/policy.test.js runs them over the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findsBackground, findsNetwork, reachesSendModule } from './repository/repo.js';

test('the scans of the send module find it however it is reached, and every timer and event', () => {
  for (const code of [
    "import { obsidianTransport } from './send';",
    'import { obsidianTransport } from "./send";',
    "import { obsidianTransport } from '../ai/send.ts';",
    "const m = await import('./send');",
    'const m = require("./ai/send.js");',
    "import './send';",
  ])
    assert.ok(reachesSendModule(code), code);
  assert.equal(reachesSendModule("import { x } from './sender';"), false);
  assert.ok(findsNetwork('await request({ url })'));
  assert.equal(findsNetwork('Local refused the request (HTTP 503: busy).'), false);
  for (const code of [
    "el.addEventListener('click', go)",
    "this.app.vault.on('modify', go)",
    'emitter.on (name, go)',
    'window.setTimeout(go, 10)',
    'this.registerDomEvent(el, "click", go)',
  ])
    assert.ok(findsBackground(code), code);
  assert.equal(findsBackground('b.onClick(() => send())'), false);
});

test('the list a plug-in’s worker takes away is not a request, but a call beside it still is', () => {
  const lockDown = "export const LOCKED_AWAY = [\n  'fetch',\n  'WebSocket',\n] as const;";
  assert.equal(findsNetwork(lockDown), false);
  assert.ok(findsNetwork(`${lockDown}\nawait fetch(url);`));
});
