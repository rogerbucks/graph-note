// The AI use disclosed (spec §19, ai_disclosed): the README says, under its privacy heading, that the plugin sends
// content only to models the user sets up and only when the user sends it, and states that one exception to no network
// use precisely. Moved here from test/policy.test.js, its names kept, to keep that file within its size.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './repository/repo.js';

describe('the AI use is disclosed', () => {
  const privacy = () => /## Privacy and network use\n([\s\S]*?)(?=\n## )/.exec(read('README.md'))?.[1] ?? '';

  test('the README says content goes only to models the user sets up, and only when the user sends it', () => {
    const said = privacy();
    assert.match(said, /only to (an )?AI models? (that )?you (have )?set up/i);
    assert.match(said, /only when you send it/i);
    assert.match(said, /off until you turn it on/i);
  });

  test('it says unclassified notes are refused, credentials are found by common patterns, and what Obsidian adds', () => {
    const said = privacy();
    assert.match(said, /no classification counts as the most sensitive level/);
    assert.match(said, /Unlabelled notes count as/);
    assert.match(said, /common patterns/);
    assert.match(said, /Obsidian follows redirects; point a model only at an address you trust/);
    assert.match(said, /adds headers of its own/);
    assert.match(said, /without the text sent/);
  });

  test('it states the one exception to no network use, never that there are no requests at all', () => {
    const said = privacy();
    assert.doesNotMatch(said, /makes no network requests\./);
    assert.match(said, /The one exception/);
  });
});
