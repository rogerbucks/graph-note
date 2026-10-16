// The mirror's own issues (spec §12, requirements_checked_in_ci): reading them from GitHub, by the logins it adopts (the
// repository's owner and the workflows' bot), and the guards that keep the mirror from making the same issue twice. An
// issue the mirror does not find as its own it makes again, so if GitHub's list by creator failed to give back the
// bot's issues, every push to main would make them all again. The list by creator does work, but may be a moment behind
// an issue just made, so the mirror also reads the newest issues, and the first issue an apply makes is looked for in
// both, again after each delay; only an issue that none of them gives back stops the creating. The apply edits, closes
// and reopens issues before it makes any, so a stop never holds back a downgrade. A run in the workflow may also make at most MAX_CREATES issues on a board that has its issues.
// Through a runner handed in, as github-project-gh.mjs.
import { BOT_LOGIN, adoptedId } from './github-project-desired.mjs';
import { whole } from './github-project-read.mjs';

/** The most issues a list is asked for; a list that comes back this long may be cut short. */
export const ISSUE_CAP = 5000;
/** The most issues a run of the workflow may make on a board that already has issues of its own. */
export const MAX_CREATES = 20;

/** The creating stopped: an issue the bot made is not given back by the list by creator, so it would be made again. */
export class CreatesUnlisted extends Error {}
/** A run of the workflow would make more issues than MAX_CREATES on a board that has its issues: a person checks it. */
export class CreatesCapped extends Error {}

/**
 * An issue's author as one login: gh gives a GitHub App's as `app/<name>` (and marks it a bot), which is `<name>[bot]`
 * here, as the REST API and BOT_LOGIN spell it.
 */
export function authorOf(author) {
  const login = author?.login;
  if (typeof login !== 'string') return undefined;
  const bot = author.is_bot === true || login.startsWith('app/');
  const name = login.replace(/^app\//, '');
  return bot && !name.endsWith('[bot]') ? `${name}[bot]` : name;
}

const issueOf = (i) => ({
  number: i.number,
  title: i.title,
  body: i.body ?? '',
  state: String(i.state).toUpperCase(),
  labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)),
  author: authorOf(i.user),
  url: i.html_url,
  closedAt: i.closed_at ?? null,
});

/**
 * The issues of a repository, only those `author` wrote where one is given: the mirror adopts only the issues of its own
 * logins, so asking for those alone keeps issues anybody else files from reaching the cap of the list. They are read
 * from the REST list endpoint by `creator`, paged through, not by `gh issue list`, which may use the search (capped at
 * 1,000, and behind its index, so a create tried again could be made twice). A pull request, which that endpoint lists
 * too, is left out. Each is {number, title, body, state ('OPEN' or 'CLOSED'), labels (names), author, url, closedAt}.
 */
export function readIssues(run, repo, author) {
  const creator = author ? `&creator=${encodeURIComponent(author)}` : '';
  const pages = JSON.parse(
    run(['api', `repos/${repo}/issues?state=all${creator}&per_page=100`, '--paginate', '--slurp']),
  );
  const issues = pages.flat().filter((i) => !i.pull_request);
  return whole(issues, ISSUE_CAP, 'issues').map(issueOf);
}

/**
 * The issues of a repository, newest first, whoever wrote them, in the shape readIssues gives: every page, unfiltered, so
 * an older mirror issue never drops out of what is adopted as the repository grows.
 */
export function readNewest(run, repo) {
  const pages = JSON.parse(
    run(['api', `repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=100`, '--paginate', '--slurp']),
  );
  // no cap: --paginate reads every page, so the list is whole however many issues others have filed
  return pages
    .flat()
    .filter((i) => !i.pull_request)
    .map(issueOf);
}

/** The logins whose issues the mirror adopts: the repository's owner, and the workflows' bot, which runs it on main. */
export const adoptersOf = (repo) => [repo.split('/')[0], BOT_LOGIN];

/**
 * The issues each of the `adopters` wrote, once each, by number: the lists by creator, and the newest issues of the
 * repository that an adopter wrote. GitHub's list by creator works (`creator=github-actions[bot]` gives the workflows'
 * bot's issues) but may be a moment behind an issue just made (run 38891890822), and an issue it has not yet listed would
 * be made again; the unfiltered list of the newest issues shows it at once.
 */
export function readAdoptable(run, repo, adopters, warn = () => {}) {
  const logins = [adopters].flat();
  const found = new Map();
  for (const login of logins) for (const issue of readIssues(run, repo, login)) found.set(issue.number, issue);
  const missed = [];
  for (const issue of readNewest(run, repo))
    if (logins.includes(issue.author) && !found.has(issue.number)) {
      found.set(issue.number, issue);
      missed.push(issue.number);
    }
  // the list by creator should have given them: say so, so a broken filter is never silent
  if (missed.length)
    warn(
      `the creator list missed ${missed.length === 1 ? 'issue' : 'issues'} ${missed.map((n) => `#${n}`).join(', ')} that the newest-issues read found; they are adopted, but check the creator filter`,
    );
  return [...found.values()].sort((a, b) => a.number - b.number);
}

const unlisted = (creator) =>
  `${creator === BOT_LOGIN ? 'bot-created issues' : `issues ${creator} made`} aren’t listed by creator=${creator}`;

/**
 * The guard of an apply's creating, for `plan` (buildPlan's, with its `creator` and `adopters`): `before()` runs before
 * the first issue is made, and stops (CreatesUnlisted) when one of the newest issues is one of the mirror's own, for a
 * requirement it is about to make, that the lists by creator did not give back; `after(number)` runs once the first
 * issue is made, and stops when the list by `creator` does not give that issue back. Either way the issue would be made
 * again by every run, so the creating stops at once.
 */
export function createGuard(read, repo, plan, { sleep = () => {}, delays = [] } = {}) {
  const creator = plan.creator;
  const stop = () => new CreatesUnlisted(`${unlisted(creator)}; creating stopped to avoid duplicates`);
  return {
    before() {
      const making = new Set(plan.issues.create.map((d) => d.id));
      if (readNewest(read, repo).some((i) => making.has(adoptedId(i, plan.adopters)))) throw stop();
    },
    after(number) {
      // the lists may be a moment behind the issue just made: look again after each delay before giving up
      for (let tried = 0; ; tried += 1) {
        if (readAdoptable(read, repo, plan.adopters ?? creator).some((i) => i.number === number)) return;
        if (tried >= delays.length) throw stop();
        sleep(delays[tried]);
      }
    },
  };
}

/**
 * Why a run of the workflow may not make the issues of `plan`, or null: it makes more than `cap` on a board that already
 * has issues of its own (a first mirror, with none yet, makes them all).
 */
export function createsProblem(plan, cap = MAX_CREATES) {
  const n = plan.issues.create.length;
  if (n <= cap || Object.keys(plan.issues.held ?? {}).length === 0) return null;
  return `the plan makes ${n} issues, more than ${cap} in one run on a board that has its issues already; nothing was applied, so a person checks it and applies it`;
}
