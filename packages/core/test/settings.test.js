// The editor's options (editor spec §21, settings_page, settings_ai_models, settings_formatting): every option with its
// sentence, its defaults, the AI models of §19 each with a purpose and a ceiling, how written text is formatted, and the
// drawing defaults, chosen only among what the locked style allows. Saved settings are read back whole, and nothing
// secret is ever kept in them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OPTIONS, DEFAULT_SETTINGS, settingsFrom, indentText, aiModel } from '../src/settings.ts';
import { DEPARTURES } from '../src/strictness.ts';
import { STYLE } from '../src/layout.ts';
import { directions } from '../src/render.ts';
import { lockBlock } from '../src/lock.ts';
import { readNote } from '../src/drawing.ts';

describe('the options', () => {
  test('each option has a name and a sentence saying what it does', () => {
    assert.ok(OPTIONS.length >= 6);
    for (const o of OPTIONS) {
      assert.ok(o.name, o.key);
      assert.match(o.sentence, /^[A-Z].*\.$/, `${o.key}: ${o.sentence}`);
    }
  });

  test('every setting the editor keeps is offered as an option, and every option is a setting', () => {
    assert.deepEqual(OPTIONS.map((o) => o.key).sort(), Object.keys(DEFAULT_SETTINGS).sort());
  });

  test('strictness has three levels, Forgiving the default', () => {
    const o = OPTIONS.find((x) => x.key === 'strictness');
    assert.deepEqual(
      o.choices.map((c) => c.value),
      ['standard', 'forgiving', 'simplified'],
    );
    for (const c of o.choices) assert.match(c.sentence, /\.$/);
    assert.equal(DEFAULT_SETTINGS.strictness, 'forgiving');
  });

  test('Simplified offers each departure from standard GQL, none allowed until chosen', () => {
    const o = OPTIONS.find((x) => x.key === 'allowed');
    assert.deepEqual(
      o.choices.map((c) => c.value),
      DEPARTURES.map((d) => d.id),
    );
    assert.deepEqual(DEFAULT_SETTINGS.allowed, []);
  });
});

describe('reading saved settings', () => {
  test('nothing saved gives the defaults', () => {
    assert.deepEqual(settingsFrom(null), DEFAULT_SETTINGS);
    assert.deepEqual(settingsFrom('nonsense'), DEFAULT_SETTINGS);
  });

  test('a value that is not one of an option’s choices falls back to its default', () => {
    const s = settingsFrom({
      strictness: 'lenient',
      indent: 'eight',
      direction: 'RL',
      allowed: ['missing-comma', 'x'],
    });
    assert.equal(s.strictness, 'forgiving');
    assert.equal(s.indent, DEFAULT_SETTINGS.indent);
    assert.equal(s.direction, DEFAULT_SETTINGS.direction);
    assert.deepEqual(s.allowed, ['missing-comma']);
  });

  test('what was saved reads back the same', () => {
    const saved = {
      strictness: 'simplified',
      allowed: ['bare-type'],
      indent: 'two',
      direction: 'TB',
      classifications: ['Public', 'Internal'],
      aiModels: [
        aiModel({ name: 'Drafts', purpose: 'Suggest links', ceiling: 'Internal', model: 'm', endpoint: 'https://e' }),
      ],
    };
    assert.deepEqual(settingsFrom(JSON.parse(JSON.stringify(saved))), { ...DEFAULT_SETTINGS, ...saved });
  });
});

describe('the AI models of §19', () => {
  test('each has its purpose and its ceiling, the highest classification it may be sent', () => {
    const m = aiModel({ name: 'Drafts', purpose: 'Suggest links', ceiling: 'Internal' });
    assert.equal(m.purpose, 'Suggest links');
    assert.equal(m.ceiling, 'Internal');
    const ceiling = OPTIONS.find((x) => x.key === 'aiModels');
    assert.match(ceiling.sentence, /purpose/);
    assert.match(ceiling.sentence, /ceiling/);
  });

  test('a ceiling no longer among the classifications is kept as written, so retyping a word never loses it', () => {
    const s = settingsFrom({ classifications: ['Public', 'Interna'], aiModels: [{ name: 'A', ceiling: 'Internal' }] });
    assert.equal(s.aiModels[0].ceiling, 'Internal');
  });

  test('a model given no ceiling gets the lowest classification', () => {
    const s = settingsFrom({ classifications: ['Public', 'Internal'], aiModels: [{ name: 'A' }] });
    assert.equal(s.aiModels[0].ceiling, 'Public');
  });

  test('the defaults are never handed out to be changed', () => {
    const s = settingsFrom(null);
    s.allowed.push('missing-comma');
    s.aiModels.push(aiModel({ name: 'A' }));
    assert.deepEqual(settingsFrom(null), DEFAULT_SETTINGS);
    assert.deepEqual(DEFAULT_SETTINGS.allowed, []);
  });

  test('a model keeps only the name of its key in the host’s secret store, never a key itself', () => {
    const s = settingsFrom({
      aiModels: [{ name: 'A', keyName: 'graph-note-a', key: 'sk-123', apiKey: 'sk-456', token: 't' }],
    });
    assert.deepEqual(Object.keys(s.aiModels[0]).sort(), ['ceiling', 'endpoint', 'keyName', 'model', 'name', 'purpose']);
    assert.equal(s.aiModels[0].keyName, 'graph-note-a');
    assert.doesNotMatch(JSON.stringify(s), /sk-|"t"/);
  });
});

describe('formatting and drawing defaults', () => {
  test('the indent of written text is two spaces, four, or a tab', () => {
    assert.deepEqual(
      OPTIONS.find((x) => x.key === 'indent').choices.map((c) => c.value),
      ['two', 'four', 'tab'],
    );
    assert.deepEqual(['two', 'four', 'tab'].map(indentText), ['  ', '    ', '\t']);
  });

  test('Lock writes the schema with the chosen indent', () => {
    const reading = readNote(["// graph: g\n(a:T {text: 'A'}),\n(a)-[:R]->(a)"]);
    const two = lockBlock(reading, 'g', '2026-10-11', indentText('two'));
    assert.match(two, /\n {2}graph: 'g'/);
    assert.doesNotMatch(two, /\n {4}\S/);
    assert.match(lockBlock(reading, 'g', '2026-10-11'), /\n {4}graph: 'g'/, 'four spaces unless told');
  });

  test('the drawing direction is the best fit, or one of the locked style’s directions, and nothing else', () => {
    assert.deepEqual(
      OPTIONS.find((x) => x.key === 'direction').choices.map((c) => c.value),
      ['best', ...STYLE.directions],
    );
  });

  test('a drawing given a direction is laid out in that direction only; with none, in each the locked style lists', () => {
    const drawing = { graph: 'g', boxes: [{ key: 'a', kind: 'T', text: 'A' }], links: [], estimates: [] };
    assert.deepEqual(
      directions(drawing).map((d) => d.rankdir),
      STYLE.directions,
    );
    assert.deepEqual(
      directions({ ...drawing, direction: 'TB' }).map((d) => d.rankdir),
      ['TB'],
    );
  });
});
