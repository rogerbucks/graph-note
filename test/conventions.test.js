// Best practice, Obsidian's and the code's (spec §13, test_conventions): Obsidian's guidelines beyond what the linter
// checks, one code style with its formatter and linter in CI, the naming conventions, the code's layout, and the
// conventions written down in CONTRIBUTING.md. Each convention a tool can check is checked here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
import { exists, read, readJSON, path, walk, ROOT } from './repository/repo.js';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const PACKAGES = ['packages/core', 'packages/graph-spec', 'packages/obsidian', 'packages/claude-code'];
const PYTHON = 'python/graph_spec';
const CODE = /\.(ts|js|mjs)$/;
/** A package's folders of code: its source, its command-line tools, the browser harness and the editor's server. */
const CODE_FOLDERS = ['src', 'bin', 'harness', 'server'];
/** The code that ships or is built from: each package's own folders. */
const codeFiles = () =>
  PACKAGES.flatMap((p) => [...CODE_FOLDERS, 'test'].flatMap((d) => walk(`${p}/${d}`))).filter((f) => CODE.test(f));
/** A package's modules held to the naming, comment and export rules: its source, and the Claude Code editor's server. */
const sourceFiles = (pkg) =>
  ['src', 'server'].flatMap((d) => walk(`${pkg}/${d}`)).filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'));
const pluginSource = () =>
  walk('packages/obsidian/src')
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ f, text: read(f) }));
const ci = () => read('.github/workflows/ci.yml');
const contributing = () => read('CONTRIBUTING.md');

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SNAKE = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const UPPER_SNAKE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

describe('one code style', () => {
  test('one formatter, Prettier, pinned, with its settings in the repository', () => {
    assert.equal(readJSON('package.json').devDependencies.prettier, '3.9.9');
    assert.deepEqual(readJSON('.prettierrc.json'), { printWidth: 120, singleQuote: true });
    assert.ok(exists('.prettierignore'));
  });

  test('the code is formatted, and CI checks it', () => {
    const r = spawnSync(path('node_modules/.bin/prettier'), ['--check', '.'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(readJSON('package.json').scripts['format:check'], 'prettier --check .');
    assert.match(ci(), /run: npm run format:check/);
  });

  test('the test vault settings, which Obsidian rewrites in its own layout, are not format-checked', () => {
    for (const f of ['test-vault/.obsidian/app.json', 'test-vault/.obsidian/community-plugins.json']) {
      const r = spawnSync(path('node_modules/.bin/prettier'), ['--file-info', f], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(JSON.parse(r.stdout).ignored, true, f);
    }
  });

  test('the linter runs in CI with no warnings allowed', () => {
    assert.equal(readJSON('package.json').scripts.lint, 'eslint . --max-warnings 0');
    assert.match(ci(), /run: npm run lint/);
  });

  test('TypeScript is strict in every package', () => {
    for (const p of PACKAGES) assert.equal(readJSON(`${p}/tsconfig.json`).compilerOptions.strict, true, p);
  });

  test('the Python library follows PEP 8: Ruff checks and formats it, pinned, in CI', () => {
    const py = read(`${PYTHON}/pyproject.toml`);
    assert.match(py, /\[dependency-groups\][^[]*\ndev = \["ruff==0\.16\.9"\]/);
    assert.match(py, /\[tool\.ruff\][^[]*\nline-length = 99/);
    assert.match(py, /\[tool\.ruff\.lint\]\s*select = \["E", "W", "F", "N"\]/);
    assert.match(ci(), /run: uv run --locked ruff check/);
    assert.match(ci(), /run: uv run --locked ruff format --check/);
    const ruff = path(`${PYTHON}/.venv/bin/ruff`);
    if (!exists(`${PYTHON}/.venv/bin/ruff`)) return; // in CI the Python job runs them
    for (const args of [['check'], ['format', '--check']]) {
      const r = spawnSync(ruff, args, { cwd: path(PYTHON), encoding: 'utf8' });
      assert.equal(r.status, 0, r.stdout + r.stderr);
    }
  });
});

/** True for a variable of the module itself: at the top of the file, or of a UMD module's wrapping function. */
function moduleLevel(decl) {
  const statement = decl.parent?.parent,
    p = statement?.parent;
  if (!statement || !ts.isVariableStatement(statement) || !p) return false;
  if (ts.isSourceFile(p)) return true;
  if (!ts.isBlock(p) || !p.parent || !ts.isFunctionExpression(p.parent)) return false;
  let up = p.parent.parent;
  while (up && (ts.isParenthesizedExpression(up) || ts.isCallExpression(up))) up = up.parent;
  return !!up && ts.isExpressionStatement(up) && ts.isSourceFile(up.parent);
}

describe('naming conventions', () => {
  test('files are kebab-case; Python files are snake_case', () => {
    for (const f of codeFiles()) {
      const name = basename(f).replace(/(\.test)?(\.d)?\.(ts|js|mjs)$/, '');
      assert.match(name, KEBAB, f);
    }
    // a package's __init__.py is the one name Python itself requires
    for (const f of walk(PYTHON).filter((x) => x.endsWith('.py') && basename(x) !== '__init__.py'))
      assert.match(basename(f, '.py'), SNAKE, f);
  });

  test('only a test is named like a test, so `node --test` never runs a script or a module as one', () => {
    // Node's default test patterns: test.js, test-*.js, *.test.js, *-test.js, *_test.js, and anything in a test folder
    const LIKE_A_TEST = /^(test|test-.+|.+[._-]test)\.(c|m)?js$/;
    const named = walk('.').filter(
      (f) => /\.(c|m)?js$/.test(f) && LIKE_A_TEST.test(basename(f)) && !/(^|\/)(test|tests)\//.test(f),
    );
    assert.deepEqual(named, []);
  });

  test('types and classes are PascalCase; functions, methods and variables camelCase; constants UPPER_SNAKE', () => {
    const wrong = [];
    for (const f of PACKAGES.flatMap(sourceFiles)) {
      const src = ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true);
      const check = (name, ok, what) => {
        if (name && !ok.some((re) => re.test(name))) wrong.push(`${f}: ${what} ${name}`);
      };
      const visit = (n) => {
        if (
          ts.isClassDeclaration(n) ||
          ts.isInterfaceDeclaration(n) ||
          ts.isTypeAliasDeclaration(n) ||
          ts.isEnumDeclaration(n)
        )
          check(n.name?.text, [PASCAL], 'type');
        else if (ts.isFunctionDeclaration(n)) check(n.name?.text, [CAMEL], 'function');
        else if (
          (ts.isMethodDeclaration(n) || ts.isPropertyDeclaration(n)) &&
          n.name &&
          ts.isIdentifier(n.name) &&
          ts.isClassLike(n.parent)
        ) {
          const constant =
            n.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) &&
            n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword);
          check(n.name.text, constant ? [CAMEL, UPPER_SNAKE] : [CAMEL], 'member');
        } else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name))
          check(n.name.text, moduleLevel(n) ? [CAMEL, UPPER_SNAKE] : [CAMEL, /^_[a-z]?[A-Za-z0-9]*$/], 'variable');
        else if (ts.isParameter(n) && ts.isIdentifier(n.name))
          check(n.name.text, [CAMEL, /^_[A-Za-z0-9]*$/], 'parameter');
        n.forEachChild(visit);
      };
      visit(src);
    }
    assert.deepEqual(wrong, []);
  });

  test('each test file is named after its file, or listed in CONTRIBUTING.md as a test that spans modules', () => {
    const spanning = new Set([...contributing().matchAll(/^- `([^`]+\.(?:test\.(?:js|mjs)|py))`/gm)].map((m) => m[1]));
    const loose = [];
    const named = (mods, n) => mods.some((m) => n === m || n.startsWith(`${m}-`) || n.startsWith(`${m}_`));
    for (const p of PACKAGES) {
      const mods = CODE_FOLDERS.flatMap((d) => walk(`${p}/${d}`)).map((f) =>
        basename(f).replace(/(\.d)?\.(ts|js|mjs)$/, ''),
      );
      for (const f of walk(`${p}/test`).filter((x) => /\.test\.(js|mjs)$/.test(x)))
        if (!named(mods, basename(f).replace(/\.test\.(js|mjs)$/, '')) && !spanning.has(f)) loose.push(f);
    }
    const pyMods = walk(`${PYTHON}/src`)
      .filter((f) => f.endsWith('.py'))
      .map((f) => basename(f, '.py'));
    for (const f of walk(`${PYTHON}/tests`).filter((x) => /test_\w+\.py$/.test(x)))
      if (!named(pyMods, basename(f, '.py').slice(5)) && !spanning.has(f)) loose.push(f);
    for (const f of walk('test').filter((x) => /\.test\.(js|mjs)$/.test(x))) if (!spanning.has(f)) loose.push(f);
    assert.deepEqual(loose, []);
    for (const f of spanning) assert.ok(exists(f), `${f} is listed but missing`);
  });
});

describe('the code’s layout', () => {
  test('each package keeps its code in src/ and its tests in test/; the Python library in src/ and tests/', () => {
    for (const p of PACKAGES) for (const d of ['src', 'test']) assert.ok(exists(`${p}/${d}`), `${p}/${d}`);
    for (const d of ['src', 'tests']) assert.ok(exists(`${PYTHON}/${d}`), `${PYTHON}/${d}`);
  });

  test('each module says first what it is for: one module, one purpose', () => {
    for (const f of [...PACKAGES.flatMap(sourceFiles), ...walk(`${PYTHON}/src`).filter((x) => x.endsWith('.py'))]) {
      assert.match(read(f), f.endsWith('.py') ? /^(#!.*\n)?("""|#)/ : /^(\/\/|\/\*)/, f);
    }
  });

  test('the public interface is documented where it is declared: every export has its comment', () => {
    const bare = [];
    for (const f of ['packages/core', 'packages/obsidian', 'packages/claude-code'].flatMap(sourceFiles)) {
      const text = read(f),
        src = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
      for (const n of src.statements) {
        const exported =
          ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!exported || ts.isExportDeclaration(n)) continue;
        // its own comment: the last one before it, with no blank line between (a module's opening comment is not one)
        const own = ts.getLeadingCommentRanges(text, n.getFullStart())?.at(-1);
        if (!own || /\n\s*\n/.test(text.slice(own.end, n.getStart(src)))) {
          const name = n.name?.text ?? n.declarationList?.declarations[0]?.name.getText(src);
          bare.push(`${f}: ${name}`);
        }
      }
    }
    assert.deepEqual(bare, []);
  });
});

describe('small modules, easy to find and to work in', () => {
  // no_monolith_files and "Easy for an AI to work in" (spec §13; Roger, 9 Oct 2026: "Structure the code as a senior dev
  // would, rather than a monolith file"): small modules with one responsibility each, in folders named for their
  // feature, each package with a guide to where things live; a package's entry points stay, re-exporting the modules
  const SOURCE = [
    ...PACKAGES.flatMap((p) => ['src', 'bin', 'server'].flatMap((d) => walk(`${p}/${d}`))).filter(
      (f) => /\.(ts|js|mjs)$/.test(f) && !f.endsWith('.d.ts'),
    ),
    ...walk(`${PYTHON}/src`).filter((f) => f.endsWith('.py')),
    ...walk('scripts').filter((f) => /\.(js|mjs)$/.test(f)),
  ];
  const TESTS = [
    ...PACKAGES.flatMap((p) => walk(`${p}/test`)).filter((f) => /\.(js|mjs)$/.test(f)),
    ...walk(`${PYTHON}/tests`).filter((f) => f.endsWith('.py')),
    ...walk('test').filter((f) => /\.(js|mjs)$/.test(f)),
  ];
  const lines = (f) => read(f).split('\n').length;

  test('no source file is over 400 lines, and no test file over 600', () => {
    const over = [
      ...SOURCE.filter((f) => lines(f) > 400).map((f) => `${f}: ${lines(f)}`),
      ...TESTS.filter((f) => lines(f) > 600).map((f) => `${f}: ${lines(f)}`),
    ];
    assert.deepEqual(over, []);
  });

  test('folders and files are named for the feature they hold, never utils, misc, helpers, common or lib', () => {
    const vague = /^(utils?|misc|helpers?|common|lib|stuff|shared)$/;
    const loose = [...SOURCE, ...TESTS]
      .flatMap((f) =>
        f.split('/').map((part, i, all) => ({ f, part: i === all.length - 1 ? part.replace(/\..*$/, '') : part })),
      )
      .filter(({ part }) => vague.test(part))
      .map(({ f }) => f);
    assert.deepEqual([...new Set(loose)], []);
  });

  test('each package has a guide saying where things live, naming every folder of its source', () => {
    const missing = [];
    for (const p of [...PACKAGES, PYTHON]) {
      const guide = `${p}/GUIDE.md`;
      if (!exists(guide)) {
        missing.push(guide);
        continue;
      }
      const text = read(guide);
      const folders = [
        ...new Set(
          walk(`${p}/src`)
            .map((f) => f.slice(`${p}/`.length).split('/').slice(0, -1).join('/'))
            .filter(Boolean),
        ),
      ];
      for (const d of folders) if (!text.includes(`${d}/`)) missing.push(`${guide}: ${d}/`);
    }
    assert.deepEqual(missing, []);
  });

  test('every public Python function says what it does and is typed, so it is used without reading its inside', () => {
    const bare = [];
    const r = spawnSync(
      'python3',
      [
        '-c',
        `import ast, sys
for f in sys.argv[1:]:
    tree = ast.parse(open(f, encoding='utf-8').read())
    for n in tree.body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and not n.name.startswith('_'):
            args = [a for a in n.args.args + n.args.kwonlyargs if a.arg not in ('self', 'cls')]
            if not ast.get_docstring(n) or n.returns is None or any(a.annotation is None for a in args):
                print(f"{f}: {n.name}")`,
        ...walk(`${PYTHON}/src`)
          .filter((f) => f.endsWith('.py'))
          .map((f) => path(f)),
      ],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
    bare.push(
      ...r.stdout
        .split('\n')
        .filter(Boolean)
        .map((l) => l.replace(`${ROOT}/`, '')),
    );
    assert.deepEqual(bare, []);
  });
});

describe('Obsidian’s guidelines, beyond the linter', () => {
  test('the linter is the plugin store’s own, sentence case in the interface among its rules', () => {
    assert.match(read('eslint.config.mjs'), /\.\.\.obsidianmd\.configs\.recommended/);
  });

  test('styles use Obsidian’s theme variables, never a fixed colour, and only the plugin’s own classes', () => {
    const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no hex colours');
    assert.doesNotMatch(css, /\b(rgba?|hsla?)\(\s*\d/, 'no fixed rgb or hsl');
    for (const [, sel] of css.matchAll(/(?:^|[{};])\s*([^{}@;]+?)\s*\{/gm)) {
      for (const s of sel.split(/,(?![^(]*\))/))
        if (!s.includes('@') && !/^\d|^from$|^to$/.test(s.trim()))
          assert.match(s, /\.(graph-note\b|gql-)/, `selector ${s.trim()}`);
    }
  });

  test('no inline styles and no HTML strings: classes and the DOM helpers', () => {
    for (const { f, text } of pluginSource()) {
      assert.doesNotMatch(text, /\.style\.\w+\s*=|setAttribute\(\s*'style'/, f);
      assert.doesNotMatch(text, /innerHTML|outerHTML|insertAdjacentHTML/, f);
    }
  });

  test('every listener on the app, window or document is registered, so it goes when the plugin does', () => {
    for (const { f, text } of pluginSource()) {
      assert.doesNotMatch(text, /\b(window|document|activeWindow|activeDocument)(\.body)?\.addEventListener/, f);
      for (const m of text.matchAll(/\.app\.(workspace|vault|metadataCache)\.on\(/g))
        assert.match(
          text.slice(Math.max(0, (m.index ?? 0) - 30), m.index),
          /registerEvent\(\s*[\w.]*$/,
          `${f}: ${m[0]}`,
        );
    }
  });

  test('every timer is registered, or cleared when its component unloads', () => {
    for (const { f, text } of pluginSource()) {
      for (const m of text.matchAll(/setInterval\(/g))
        assert.match(
          text.slice(Math.max(0, (m.index ?? 0) - 40), m.index),
          /registerInterval\((window|activeWindow|w)\.$/,
          f,
        );
      const kept = [...text.matchAll(/this\.(\w+) =\s*\w+\.setTimeout\(/g)].map((m) => m[1]);
      const unload = /onunload\(\): void \{([\s\S]*?)\n {2}\}/.exec(text)?.[1] ?? '';
      for (const t of new Set(kept))
        assert.match(unload, new RegExp(`clearTimeout\\(this\\.${t}\\)`), `${f}: ${t} is cleared on unload`);
    }
  });

  test('the vault is changed only through its API, atomically, and the app is never the global one', () => {
    for (const { f, text } of pluginSource()) {
      assert.doesNotMatch(text, /\badapter\.|from 'node:fs'|from 'fs'|require\('fs'\)/, f);
      assert.doesNotMatch(text, /vault\.modify\(/, `${f}: vault.process, not vault.modify`);
      assert.doesNotMatch(text, /(?<![.\w])app\.|window\.app\b/, `${f}: this.app, never the global app`);
    }
  });
});

describe('the conventions, written down', () => {
  test('CONTRIBUTING.md gives each convention, and the README points to it', () => {
    const c = contributing();
    for (const h of ['Obsidian’s guidelines', 'Code style', 'Naming', 'Layout', 'Tests that span modules'])
      assert.match(c, new RegExp(`^## ${h}`, 'm'), h);
    for (const tool of [
      'npm run format:check',
      'npm run lint',
      'npm run typecheck',
      'ruff check',
      'test/conventions.test.js',
    ])
      assert.ok(c.includes(tool), tool);
    assert.match(read('README.md'), /\(CONTRIBUTING\.md\)/);
  });

  test('every rule here is said in CONTRIBUTING.md too', () => {
    const c = contributing();
    for (const word of [
      'kebab-case',
      'PascalCase',
      'camelCase',
      'UPPER_SNAKE',
      'snake_case',
      'PEP 8',
      'strict',
      'registerEvent',
      'registerDomEvent',
      'clearTimeout',
      'vault.process',
      'theme variables',
      'sentence case',
      '400 lines',
      'test file over 600',
      'GUIDE.md',
      'type hints',
      'never `utils`',
    ]) {
      assert.ok(c.includes(word), word);
    }
  });
});
