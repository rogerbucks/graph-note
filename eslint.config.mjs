// The Obsidian review rules, as the plugin store's review bot checks them.
// Repository tooling (tests, scripts) runs in Node, not in Obsidian. So it is
// left to the Node test suite rather than linted against the plugin rules.
// packages/graph-spec/src is linted as CommonJS modules, which the plugin bundles
// and Node requires; its released single file is built from them.
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  {
    ignores: [
      'main.js',
      // the test vault's own files, and the build linked into it
      'test-vault/',
      '.claude/',
      '**/node_modules/',
      '**/dist/',
      'test/',
      'scripts/',
      'python/',
      '.venv/',
      'packages/*/esbuild.config.mjs',
      'packages/*/esbuild.*.mjs',
      'packages/*/test/',
      'packages/*/bin/',
      'packages/*/harness/',
      'spikes/',
      // the sample plug-in is plain JavaScript a person writes, run in a worker; test/sample-plugin.test.js checks it
      'examples/',
      // the Claude Code mod runs in its own environment, typed by Claude Code's API. `claude plugin validate`, its own
      // type check and `claude plugin test` check it (packages/claude-code/GUIDE.md)
      'packages/claude-code/mod/',
      // the desktop app's Rust build, with the scripts Tauri writes into it
      'packages/app/src-tauri/',
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // GQL is the name of the language the graphs are written in, an acronym like SQL. The interface says "standard GQL"
    // (spec §21), so the word is kept as written. The rule's own settings otherwise, as the recommended set gives them.
    rules: {
      'obsidianmd/ui/sentence-case': ['warn', { enforceCamelCaseLower: true, ignoreWords: ['GQL'] }],
    },
  },
  {
    // The Claude Code editor's local server runs in Node, as a process of its own, never in Obsidian or a page
    // (packages/claude-code/GUIDE.md): Node's built-ins and globals are what it is written in, and a popout window's
    // timers mean nothing there. Every other rule holds.
    files: ['packages/claude-code/server/**/*.ts'],
    languageOptions: { globals: { process: 'readonly', Buffer: 'readonly' } },
    rules: { 'obsidianmd/no-nodejs-modules': 'off', 'obsidianmd/prefer-window-timers': 'off' },
  },
  {
    // The browser editor's page is an ordinary web page in Claude Code's pane, not an Obsidian view. It has one window
    // and none of Obsidian's DOM helpers. So the rules that exist for Obsidian's popout windows and its `createEl`
    // family mean nothing there (packages/claude-code/GUIDE.md). Every other rule holds, the ones against HTML strings
    // among them.
    // The desktop app's pages are the same kind of page, in the app's own window (packages/app/GUIDE.md).
    files: ['packages/claude-code/page/**/*.ts', 'packages/app/src/**/*.ts'],
    rules: { 'obsidianmd/prefer-create-el': 'off', 'obsidianmd/no-global-this': 'off' },
  },
  {
    // The graph-spec library is plain CommonJS modules, gathered by its entry point and bundled into one file for pages
    // (packages/graph-spec/GUIDE.md). The plugin's esbuild bundles them too. require() is how its modules import.
    // (graph-layout.js stays one UMD file, page global and module.exports, so it is left as it was.)
    files: ['packages/graph-spec/src/**/*.js'],
    ignores: ['packages/graph-spec/src/graph-layout.js'],
    // sourceType gives each file Node's module globals; globalReturn gives it the module scope it has at run time
    languageOptions: { sourceType: 'commonjs', parserOptions: { ecmaFeatures: { globalReturn: true } } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
