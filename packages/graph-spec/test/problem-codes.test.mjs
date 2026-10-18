// Editor spec §42, problem_codes: every problem the document profile reader raises carries a stable code. It is the
// diagnostic code of the Language Server Protocol, the same from the JavaScript and the Python libraries. So its
// message and fix can be translated and looked up. The codes are one table, src/reader/problem-codes.json.
// - The sources are scanned, so every raise site passes a code the table gives, with the table's message and fix.
// - The blocks of problem-code-cases.json are refused with their codes. python/graph_spec/tests/test_problem_codes.py
//   reads them too.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');
const json = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const TABLE = json('../src/reader/problem-codes.json');
const CASES = json('./problem-code-cases.json');
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const BY_CODE = new Map(TABLE.codes.map((c) => [c.code, c]));

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );

/** The arguments of the call whose opening parenthesis is at `open`, each as written, split at its own commas. */
function argsAt(text, open) {
  const args = [],
    stack = [];
  let start = open + 1;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i],
      top = stack.at(-1);
    if (top === "'" || top === '"') {
      if (c === '\\') i++;
      else if (c === top) stack.pop();
    } else if (top === '`') {
      if (c === '\\') i++;
      else if (c === '`') stack.pop();
      else if (c === '$' && text[i + 1] === '{') (stack.push('${'), i++);
    } else if ('\'"`'.includes(c)) stack.push(c);
    else if ('([{'.includes(c)) stack.push(c);
    else if (')]}'.includes(c)) {
      if (!stack.length) {
        args.push(text.slice(start, i).trim());
        return args.filter(Boolean);
      }
      stack.pop();
    } else if (c === ',' && !stack.length) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  throw new Error('a call with no end');
}

/** A message or fix as written in the source, its interpolations as {}: a literal, or a constant of its file. */
function written(arg, file) {
  if (/^[A-Z_]+$/.test(arg)) {
    const m = new RegExp(`\\b${arg} =\\s*('(?:[^'\\\\]|\\\\.)*')`).exec(file);
    assert.ok(m, `the constant ${arg}`);
    arg = m[1];
  }
  assert.match(arg, /^(['"`]).*\1$/s, `a message or fix written as a literal: ${arg}`);
  let body = arg.slice(1, -1);
  if (arg[0] === '`') {
    let out = '';
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '$' && body[i + 1] === '{') {
        let depth = 1,
          j = i + 2;
        for (; depth; j++) depth += body[j] === '{' ? 1 : body[j] === '}' ? -1 : 0;
        out += '{}';
        i = j - 1;
      } else out += body[i];
    }
    body = out;
  }
  return body.replace(/\\(.)/g, '$1');
}

/** A table template with each {name} as {}, as written() gives the source's. */
const shape = (template) => template.replace(/\{[a-z_]+\}/g, '{}');
/** A table template as a pattern each problem it gives matches. */
const pattern = (template) =>
  new RegExp(
    '^' +
      template
        .split(/\{[a-z_]+\}/)
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$',
    's',
  );

/** Every place the JavaScript library raises a ProfileError: its file, line, code, message and fix as written. */
function raiseSites() {
  const out = [];
  for (const f of walk(SRC)) {
    const text = readFileSync(f, 'utf8'),
      call = /(?:new (?:ProfileError|IdNotTextError)|(?<![\w.])refuse)\(/g;
    for (let m; (m = call.exec(text));) {
      const args = argsAt(text, m.index + m[0].length - 1),
        line = text.slice(0, m.index).split('\n').length,
        where = `${f.slice(SRC.length)}:${line}`;
      if (args[1] === 'message') continue; // refuse's own throw: it passes on its caller's message, fix and code
      const code = /^'(GN\d{3})'$/.exec(args.at(-1) ?? '')?.[1] ?? null;
      out.push({ where, code, message: written(args[1], text), fix: written(args[2], text) });
    }
  }
  return out;
}

describe('editor spec §42, problem_codes: the table of codes', () => {
  test('every code is GN and three digits, given once, with its message, its fix, its section and its libraries', () => {
    assert.match(TABLE.about, /never reused/);
    assert.equal(BY_CODE.size, TABLE.codes.length, 'no code given twice');
    for (const c of TABLE.codes) {
      assert.match(c.code, /^GN\d{3}$/);
      assert.equal(typeof c.message, 'string', c.code);
      assert.equal(typeof c.fix, 'string', c.code);
      assert.ok(c.section === null || /^\d+$/.test(c.section), c.code);
      assert.ok(c.libraries.length && c.libraries.every((l) => l === 'js' || l === 'py'), c.code);
    }
  });
});

describe('editor spec §42, problem_codes: every raise site in the JavaScript library', () => {
  const sites = raiseSites();

  test('every ProfileError raised passes a code the table gives the JavaScript library', () => {
    assert.ok(sites.length > 40, `the raise sites found: ${sites.length}`);
    const bad = sites.filter((s) => !s.code || !BY_CODE.get(s.code)?.libraries.includes('js'));
    assert.deepEqual(
      bad.map((s) => `${s.where} ${s.code}`),
      [],
    );
  });

  test('each raise site writes its code’s message and fix, and no code is used for two messages', () => {
    const wrong = [],
      messages = new Map();
    for (const s of sites) {
      const c = BY_CODE.get(s.code);
      if (!c) continue;
      if (s.message !== shape(c.message) || s.fix !== shape(c.fix)) wrong.push(`${s.where} ${s.code}: ${s.message}`);
      messages.set(s.code, new Set([...(messages.get(s.code) ?? []), `${s.message} — ${s.fix}`]));
    }
    assert.deepEqual(wrong, []);
    for (const [code, set] of messages) assert.equal(set.size, 1, code);
  });

  test('every code the table gives the JavaScript library is raised somewhere', () => {
    const used = new Set(sites.map((s) => s.code));
    assert.deepEqual(
      TABLE.codes.filter((c) => c.libraries.includes('js') && !used.has(c.code)).map((c) => c.code),
      [],
    );
  });
});

/** The ProfileError a case is refused with, read as the case says. */
function refusal(c) {
  try {
    if (c.via === 'change') gs.readChange(c.block);
    else new gs.Store().apply(c.block);
  } catch (e) {
    if (e instanceof gs.ProfileError) return e;
    throw e;
  }
  return null;
}

describe('editor spec §42, problem_codes: each block is refused with its code', () => {
  const ours = CASES.cases.filter((c) => c.via !== 'to_gql' && BY_CODE.get(c.code)?.libraries.includes('js'));

  test('the cases cover many codes, each one the table gives', () => {
    for (const c of CASES.cases) assert.ok(BY_CODE.has(c.code), c.name);
    assert.ok(new Set(ours.map((c) => c.code)).size >= 10);
  });

  test('every case is refused with its code, and with its code’s message and fix', () => {
    const wrong = [];
    for (const c of ours) {
      const e = refusal(c),
        t = BY_CODE.get(c.code);
      if (!e || e.code !== c.code || !pattern(t.message).test(e.msg) || !pattern(t.fix).test(e.fix))
        wrong.push(`${c.name}: ${e ? `${e.code} ${e.msg} — ${e.fix}` : 'read'}`);
    }
    assert.deepEqual(wrong, []);
  });
});
