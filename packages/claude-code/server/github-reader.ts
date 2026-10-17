// Pull requests, merges and commits read from GitHub for review (editor spec §41, github_review_items): the repository
// the open note lives in, named by its git remote `origin` on github.com, read by the user's own GitHub command line,
// gh, with gh's own sign-in. The server keeps no token and is handed none: gh is run with fixed arguments and no shell,
// for GET alone and on github.com alone, under an environment that carries no token, and only when the user asks
// (Roger, 17 Oct 2026). Every path, number and commit put in an address is checked first, so nothing the repository or
// the page writes becomes another request.
import { execFile } from 'node:child_process';
import type { ChangedFile, ReviewItem } from '@graph-note/core';
import { originOf } from './note-history.ts';
import { BODY_LIMIT } from './request-body.ts';

/** What was read, or why not. */
export type GitHubRead<T> = { ok: true; value: T } | { ok: false; why: string };

/** One item's changed files, the repository's workstreams at its newer side, and how many files were left unread. */
export interface ItemFiles {
  files: ChangedFile[];
  /** The text of `requirements/workstreams.json` where the repository keeps one; null where it does not. */
  workstreams: string | null;
  unread: number;
}

/** How GitHub is read for the repository the note at `real` lives in: by gh, unless a test hands in its own. */
export interface GitHubReader {
  items(real: string): Promise<GitHubRead<ReviewItem[]>>;
  files(real: string, item: ReviewItem): Promise<GitHubRead<ItemFiles>>;
}

/** How many pull requests, and how many commits, are listed. */
export const ITEMS_LISTED = 20;
/** The most files of one item whose texts are read. */
export const FILES_READ = 50;
/** How long one gh command may run. */
export const GH_TIMEOUT_MS = 15000;

/** Every gh command: the API, for GET alone, on github.com alone. */
const READ_ONLY = ['api', '--method', 'GET', '--hostname', 'github.com'];
/** The environment gh is run under: where it finds its own sign-in and the way out, and no token of anyone's. */
const PASSED = [
  'PATH',
  'HOME',
  'XDG_CONFIG_HOME',
  'GH_CONFIG_DIR',
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
  'SystemRoot',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'SSL_CERT_FILE',
];

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;
const NUMBER = /^[1-9][0-9]{0,8}$/;
const NO_GH =
  'Reviewing pull requests here needs GitHub’s command line, gh: install it and sign in with `gh auth login`, then ask again.';
const NOT_ON_GITHUB =
  'This note’s repository has no remote named origin on github.com, so there are no pull requests to review here.';
const NOT_READ = 'GitHub could not be read with gh: check `gh auth status`, and that you can see this repository.';

/** The repository `owner/name` of a git remote's address on github.com; null for any other. */
export function repositoryOf(remote: string): string | null {
  const m =
    /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(
      remote.trim(),
    );
  const repo = m?.[1] ?? null;
  return repo && REPO.test(repo) && !repo.split('/').some((p) => p === '.' || p === '..') ? repo : null;
}

/** The repository on GitHub the note at `real` lives in, by its git remote `origin`. */
async function repoOf(real: string): Promise<GitHubRead<string>> {
  const remote = await originOf(real);
  const repo = remote === null ? null : repositoryOf(remote);
  return repo ? { ok: true, value: repo } : { ok: false, why: NOT_ON_GITHUB };
}

/** Runs gh's API for `endpoint`, read only; its output, or why it failed. */
function gh(endpoint: string, raw = false): Promise<GitHubRead<string>> {
  const env: Record<string, string> = {
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    GH_PAGER: 'cat',
    NO_COLOR: '1',
  };
  for (const name of PASSED) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  const accept = raw ? ['-H', 'Accept: application/vnd.github.raw'] : [];
  return new Promise((done) => {
    execFile(
      'gh',
      [...READ_ONLY, ...accept, endpoint],
      { env, timeout: GH_TIMEOUT_MS, maxBuffer: BODY_LIMIT, encoding: 'utf8', windowsHide: true },
      (error, stdout) => {
        if (!error) return done({ ok: true, value: stdout });
        done({ ok: false, why: (error as { code?: unknown }).code === 'ENOENT' ? NO_GH : NOT_READ });
      },
    );
  });
}

/** gh's answer for `endpoint`, read as JSON. */
async function json(endpoint: string): Promise<GitHubRead<unknown>> {
  const r = await gh(endpoint);
  if (!r.ok) return r;
  try {
    return { ok: true, value: JSON.parse(r.value) };
  } catch {
    return { ok: false, why: NOT_READ };
  }
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const field = (v: unknown, name: string): unknown =>
  v && typeof v === 'object' ? (v as Record<string, unknown>)[name] : undefined;

/** A file's text at a commit; null where it is not there. */
async function textAt(repo: string, path: string, commit: string): Promise<string | null> {
  if (path.split('/').some((p) => p === '' || p === '.' || p === '..')) return null;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const r = await gh(`repos/${repo}/contents/${encoded}?ref=${commit}`, true);
  return r.ok ? r.value : null;
}

/** The files GitHub lists for a change, from `older` to `newer`, with their texts on either side. */
async function filesBetween(repo: string, older: string | null, newer: string, listed: unknown): Promise<ItemFiles> {
  const entries = Array.isArray(listed) ? listed : [];
  const files: ChangedFile[] = [];
  for (const f of entries.slice(0, FILES_READ)) {
    const path = text(field(f, 'filename'));
    const status = text(field(f, 'status'));
    if (!path) continue;
    const was = text(field(f, 'previous_filename')) || path;
    const before = older && status !== 'added' ? await textAt(repo, was, older) : null;
    const after = status === 'removed' ? null : await textAt(repo, path, newer);
    files.push({ path, before, after });
  }
  return {
    files,
    workstreams: await textAt(repo, 'requirements/workstreams.json', newer),
    unread: Math.max(0, entries.length - FILES_READ),
  };
}

/** GitHub, read by the user's gh. */
export const GH_READER: GitHubReader = {
  async items(real) {
    const at = await repoOf(real);
    if (!at.ok) return at;
    const repo = at.value;
    const pulls = await json(`repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=${ITEMS_LISTED}`);
    if (!pulls.ok) return pulls;
    const commits = await json(`repos/${repo}/commits?per_page=${ITEMS_LISTED}`);
    if (!commits.ok) return commits;
    const items: ReviewItem[] = [];
    for (const p of Array.isArray(pulls.value) ? pulls.value : []) {
      const n = field(p, 'number');
      const id = typeof n === 'number' ? String(n) : '';
      if (!NUMBER.test(id)) continue;
      items.push({
        kind: 'pull',
        id,
        title: text(field(p, 'title')),
        author: text(field(field(p, 'user'), 'login')),
        when: text(field(p, 'updated_at')),
        url: text(field(p, 'html_url')),
      });
    }
    for (const c of Array.isArray(commits.value) ? commits.value : []) {
      const id = text(field(c, 'sha'));
      if (!SHA.test(id)) continue;
      const parents = field(c, 'parents');
      const said = field(c, 'commit');
      items.push({
        kind: Array.isArray(parents) && parents.length > 1 ? 'merge' : 'commit',
        id,
        title: text(field(said, 'message')).split('\n')[0] ?? '',
        author: text(field(field(c, 'author'), 'login')) || text(field(field(said, 'author'), 'name')),
        when: text(field(field(said, 'author'), 'date')),
        url: text(field(c, 'html_url')),
      });
    }
    return { ok: true, value: items };
  },

  async files(real, item) {
    const at = await repoOf(real);
    if (!at.ok) return at;
    const repo = at.value;
    if (item.kind === 'pull') {
      if (!NUMBER.test(item.id)) return { ok: false, why: 'No such pull request.' };
      const pull = await json(`repos/${repo}/pulls/${item.id}`);
      if (!pull.ok) return pull;
      const base = text(field(field(pull.value, 'base'), 'sha')),
        head = text(field(field(pull.value, 'head'), 'sha'));
      if (!SHA.test(base) || !SHA.test(head)) return { ok: false, why: NOT_READ };
      // compared from where the branch left its base, as GitHub shows a pull request's changes
      const compared = await json(`repos/${repo}/compare/${base}...${head}`);
      if (!compared.ok) return compared;
      const from = text(field(field(compared.value, 'merge_base_commit'), 'sha'));
      const value = await filesBetween(repo, SHA.test(from) ? from : base, head, field(compared.value, 'files'));
      return { ok: true, value };
    }
    if (!SHA.test(item.id)) return { ok: false, why: 'No such commit.' };
    const commit = await json(`repos/${repo}/commits/${item.id}`);
    if (!commit.ok) return commit;
    const parents = field(commit.value, 'parents');
    const first = text(field(Array.isArray(parents) ? parents[0] : undefined, 'sha'));
    // a merge is shown against its first parent, the branch it was merged into; the first commit against nothing
    const value = await filesBetween(repo, SHA.test(first) ? first : null, item.id, field(commit.value, 'files'));
    return { ok: true, value };
  },
};
