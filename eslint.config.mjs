// The Obsidian review rules, as the plugin store's review bot checks them.
// Repository tooling (tests, scripts) runs in Node, not in Obsidian, so it is
// left to the Node test suite rather than linted against the plugin rules.
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  { ignores: ['main.js', '**/node_modules/', '**/dist/', 'test/', 'scripts/', 'python/', '.venv/', 'packages/*/esbuild.config.mjs'] },
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
]);
