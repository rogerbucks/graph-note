// A note's earlier versions, for the changes view (editor spec §41, changes_view): the commits that changed the open note
// and the tips of the local branches, read from the git repository the note lives in, and the note's text at one of
// them. Read only and local: git is run with fixed arguments and no shell, its hooks, file-system monitor and pager off,
// every transport refused and no fetch of a missing object, so nothing runs that the repository names and nothing
// leaves the machine. Only the open note is ever read, and only at a commit this module listed for it.
import { execFile } from 'node:child_process';
import { dirname, relative, sep } from 'node:path';
import { BODY_LIMIT } from './request-body.ts';

/** One earlier version a user may compare with: a commit, by its full id, and how it is named in the list. */
export interface Version {
  commit: string;
  kind: 'commit' | 'branch';
  /** "Last commit: Add the plan (2026-10-16)", "Branch main". Its subject is the repository's text: shown as text. */
  label: string;
}

/** The versions listed, newest commit first, then the branches; or why there are none. */
export type Versions = { ok: true; versions: Version[] } | { ok: false; why: string };

/** The note's text at a commit; or why not. */
export type TextAt = { ok: true; text: string } | { ok: false; why: string };

/** How a note's history is read: by git, unless a test hands in its own. */
export interface NoteHistory {
  versions(real: string): Promise<Versions>;
  textAt(real: string, commit: string): Promise<TextAt>;
}

/** How many commits that changed the note are listed. */
export const COMMITS_LISTED = 20;
/** How long one git command may run. */
export const GIT_TIMEOUT_MS = 5000;

/** The settings every git command runs under: none of the repository's programs, no pager, no network. */
const SAFE = [
  '--no-pager',
  '--no-replace-objects',
  '--literal-pathspecs',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'protocol.allow=never',
  '-c',
  'core.pager=cat',
];

const COMMIT = /^[0-9a-f]{40}$/;
const NOT_KEPT = 'This note is not kept in a git repository, so there are no earlier versions to compare with.';

/** Runs git in `cwd` with `args`; its standard output, or null when it fails. */
function git(cwd: string, args: string[], limit = BODY_LIMIT): Promise<string | null> {
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_LAZY_FETCH: '1',
  };
  return new Promise((done) => {
    execFile(
      'git',
      [...SAFE, ...args],
      { cwd, env, timeout: GIT_TIMEOUT_MS, maxBuffer: limit, encoding: 'utf8', windowsHide: true },
      (error, stdout) => done(error ? null : stdout),
    );
  });
}

/** The repository's top folder, and the note's path in it written with `/`; null when the note is in none. */
async function placeOf(real: string): Promise<{ top: string; path: string } | null> {
  const top = (await git(dirname(real), ['rev-parse', '--show-toplevel']))?.replace(/\n$/, '');
  if (!top) return null;
  const path = relative(top, real).split(sep).join('/');
  return path && !path.startsWith('../') ? { top, path } : null;
}

/** The address of the remote `origin` of the repository the note lives in; null where it has none. */
export async function originOf(real: string): Promise<string | null> {
  const at = await placeOf(real);
  if (!at) return null;
  return (await git(at.top, ['config', '--get', 'remote.origin.url']))?.trim() || null;
}

/** The history git keeps. */
export const GIT_HISTORY: NoteHistory = {
  async versions(real) {
    const at = await placeOf(real);
    if (!at) return { ok: false, why: NOT_KEPT };
    const log = await git(at.top, ['log', `-n${COMMITS_LISTED}`, '--format=%H%x1f%cs%x1f%s', '--', at.path]);
    const heads = await git(at.top, ['for-each-ref', '--format=%(objectname)%1f%(refname:short)', 'refs/heads']);
    if (log === null || heads === null) return { ok: false, why: 'The repository’s history could not be read.' };
    const versions: Version[] = [];
    log.split('\n').forEach((line, i) => {
      const [commit = '', day = '', subject = ''] = line.split('\u001f');
      if (!COMMIT.test(commit)) return;
      const label = `${i === 0 ? 'Last commit' : 'Commit'}: ${subject} (${day}, ${commit.slice(0, 7)})`;
      versions.push({ commit, kind: 'commit', label });
    });
    for (const line of heads.split('\n')) {
      const [commit = '', name = ''] = line.split('\u001f');
      if (COMMIT.test(commit) && name) versions.push({ commit, kind: 'branch', label: `Branch ${name}` });
    }
    if (!versions.length) return { ok: false, why: 'This note has no earlier version in its repository yet.' };
    return { ok: true, versions };
  },

  async textAt(real, commit) {
    if (!COMMIT.test(commit)) return { ok: false, why: 'No such version.' };
    const at = await placeOf(real);
    if (!at) return { ok: false, why: NOT_KEPT };
    // cat-file, plumbing: the stored bytes, never a filter or a conversion the repository names
    const text = await git(at.top, ['cat-file', 'blob', `${commit}:${at.path}`]);
    return text === null ? { ok: false, why: 'The note was not in that version.' } : { ok: true, text };
  },
};
