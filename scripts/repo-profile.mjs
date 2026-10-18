// How the repository shows to a stranger on GitHub: the line under its name, its home page, and the topics people find
// it by. scripts/public-readiness.mjs reads and sets these with the rest of the wanted settings.

/** The line under the repository's name. It names every way the project is delivered, not only Obsidian. */
export const DESCRIPTION =
  'Draw, edit and keep graph notes. An Obsidian plugin now; an app, a VS Code plugin and a JavaScript library next. Offline and private.';

/** The home page, on the project's own domain. */
export const HOMEPAGE = 'https://thoughtknot.app/';

/** The topics people find the repository by, in order. GitHub allows 20. */
export const TOPICS = [
  'diagrams',
  'graph',
  'javascript-library',
  'knowledge-graph',
  'local-first',
  'markdown',
  'note-taking',
  'obsidian',
  'obsidian-plugin',
  'typescript',
];

/** The topics as a wanted setting: read back in order, and written whole. `gh` calls the GitHub API. */
export const topicsSetting = (gh) => ({
  name: 'topics',
  phase: 'always',
  want: TOPICS,
  read: (repo) => [...gh([`repos/${repo}/topics`]).names].sort(),
  write: (repo) => gh(['-X', 'PUT', `repos/${repo}/topics`], { names: TOPICS }),
});
