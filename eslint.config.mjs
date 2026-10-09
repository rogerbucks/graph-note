// The Obsidian review rules, as the plugin store's review bot checks them.
// Repository tooling (tests, scripts) runs in Node, not in Obsidian, so it is
// left to the Node test suite rather than linted against the plugin rules.
// packages/graph-spec/src is left out only until the plugin bundles it (slice 1): it
// moved in unchanged, and must match the vault's conformance suite before it is
// edited. The policy test refuses this once the plugin depends on it.
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  {
    ignores: [
      'main.js',
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
    // The graph-spec library is plain CommonJS modules, gathered by its entry point and bundled into one file for pages
    // (packages/graph-spec/GUIDE.md); the plugin's esbuild bundles them too. require() is how its modules import.
    // (graph-layout.js stays one UMD file, page global and module.exports, so it is left as it was.)
    files: ['packages/graph-spec/src/**/*.js'],
    ignores: ['packages/graph-spec/src/graph-layout.js'],
    // sourceType gives each file Node's module globals; globalReturn gives it the module scope it has at run time
    languageOptions: { sourceType: 'commonjs', parserOptions: { ecmaFeatures: { globalReturn: true } } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
