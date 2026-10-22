// The mirror's own issues (spec §12, requirements_checked_in_ci). This reads them from GitHub, by the logins it adopts
// (the repository's owner and the workflows' bot). It also holds the guards that keep the mirror from making the same
// issue twice.
//
// An issue the mirror does not find as its own it makes again. So if GitHub's list by creator failed to give back the
// bot's issues, every push to main would make them all again. The list by creator does work, but may be a moment
// behind an issue just made. So the mirror also reads the newest issues. The first issue an apply makes is looked for
// in both, again after each delay. Only an issue that none of them gives back stops the creating.
//
// The apply edits, closes and reopens issues before it makes any, so a stop never holds back a downgrade. A run in the
// workflow also makes at most MAX_CREATES issues on a board that has its issues. The next run makes the next ones.
// Through a runner handed in, as github-project-gh.mjs.
import { BOT_LOGIN, adoptedId } from './github-project-desired.mjs';
import { whole } from './github-project-read.mjs';

/** The most issues a list is asked for; a list that comes back this long may be cut short. */
export const ISSUE_CAP = 5000;
/** The most issues a run of the workflow may make on a board that already has issues of its own. */
export const MAX_CREATES = 20;

/** The creating stopped: an issue the bot made is not given back by the list by creator, so it would be made again. */
export class CreatesUnlisted extends Error {}

/**
 * An issue's author as one login. gh gives a GitHub App's as `app/<name>` (and marks it a bot). Here that is
 * `<name>[bot]`, as the REST API and BOT_LOGIN spell it.
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
 * The issues of a repository, only those `author` wrote where one is given. The mirror adopts only the issues of its
 * own logins. So asking for those alone keeps issues anybody else files from reaching the cap of the list. They are
 * read from the REST list endpoint by `creator`, paged through. They are not read by `gh issue list`, which may use the
 * search. The search is capped at 1,000 and behind its index, so a create tried again could be made twice. A pull
 * request, which that endpoint lists too, is left out. Each is {number, title, body, state ('OPEN' or 'CLOSED'), labels
 * (names), author, url, closedAt}.
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
 * Everything the issues list of a repository gives, newest first, whoever wrote it: issues and pull requests, as
 * GitHub sends them. It reads every page, unfiltered.
 */
const listNewest = (run, repo) =>
  JSON.parse(
    run(['api', `repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=100`, '--paginate', '--slurp']),
  ).flat();

/**
 * The issues of a repository, newest first, whoever wrote them, in the shape readIssues gives. It reads every page,
 * unfiltered, so an older mirror issue never drops out of what is adopted as the repository grows.
 */
export function readNewest(run, repo) {
  // no cap: --paginate reads every page, so the list is whole however many issues others have filed
  return listNewest(run, repo)
    .filter((i) => !i.pull_request)
    .map(issueOf);
}

/** The most numbers from #1 to the newest that a whole read may lack: issues deleted or moved leave a few gaps. */
export const GAPS_ALLOWED = 20;

/**
 * Whether a read of the issues list came back whole. It must hold every number from #1 to the newest (issues and pull
 * requests alike), but for at most GAPS_ALLOWED. On 22 Oct 2026 a read came back short, the old issues missing. The
 * mirror took their requirements for new and made 40 issues again (#961 to #1016).
 */
export function readsWhole(numbers) {
  if (!numbers.length) return true;
  return Math.max(...numbers) - new Set(numbers).size <= GAPS_ALLOWED;
}

/** The logins whose issues the mirror adopts: the repository's owner, and the workflows' bot, which runs it on main. */
export const adoptersOf = (repo) => [repo.split('/')[0], BOT_LOGIN];

/**
 * The issues each of the `adopters` wrote, once each, by number. They come from the lists by creator, and from the
 * newest issues of the repository that an adopter wrote. GitHub's list by creator works (`creator=github-actions[bot]`
 * gives the workflows' bot's issues). But it may be a moment behind an issue just made (run 38891890822). An issue it
 * has not yet listed would be made again. The unfiltered list of the newest issues shows it at once.
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
 * The guard of an apply's creating, for `plan` (buildPlan's, with its `creator` and `adopters`).
 * - `before()` runs before the first issue is made. It stops (CreatesUnlisted) when the issues list comes back short
 *   (readsWhole). It also stops on one of the newest issues that the lists by creator did not give back. That is one of
 *   the mirror's own, for a requirement it is about to make.
 * - `after(number)` runs once the first issue is made. It stops when the list by `creator` does not give that issue
 *   back.
 *
 * Either way the issue would be made again by every run, so the creating stops at once.
 */
export function createGuard(read, repo, plan, { sleep = () => {}, delays = [] } = {}) {
  const creator = plan.creator;
  const stop = () => new CreatesUnlisted(`${unlisted(creator)}; creating stopped to avoid duplicates`);
  return {
    before() {
      const listed = listNewest(read, repo);
      const numbers = listed.map((i) => i.number);
      // a short read hides old issues, whose requirements would then be made again
      if (!readsWhole(numbers))
        throw new CreatesUnlisted(
          `the issues list came back short (${new Set(numbers).size} of #1 to #${Math.max(...numbers)}); creating stopped to avoid duplicates`,
        );
      const making = new Set(plan.issues.create.map((d) => d.id));
      const newest = listed.filter((i) => !i.pull_request).map(issueOf);
      if (newest.some((i) => making.has(adoptedId(i, plan.adopters)))) throw stop();
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
 * The ids of the new issues in `plan` that a run of the workflow leaves for the next run: all but the first `cap`. It
 * leaves none when the plan makes `cap` or fewer. A first mirror, with no issue of its own yet, makes them all. So a run never makes a flood of issues, and the rest of the board still moves while they are made.
 */
export function createsHeld(plan, cap = MAX_CREATES) {
  const create = plan.issues.create;
  if (create.length <= cap || Object.keys(plan.issues.held ?? {}).length === 0) return new Set();
  return new Set(create.slice(cap).map((d) => d.id));
}

/** The warning for a run that made `cap` new issues and left `held` for the next run. */
export const heldWarning = (held, cap = MAX_CREATES) =>
  `made ${cap} new issues and left ${held} for the next push to main, which makes the next ${cap}; everything else was applied`;
