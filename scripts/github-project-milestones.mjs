// The milestones of the GitHub mirror (spec §41, plan_milestones). requirements/waves.json makes each wave its own
// milestone (Roger, 24 Oct 2026), or lists milestones above the waves, each wave naming one. The mirror makes the milestones, keeps their
// descriptions, due days and states, and files every requirement's issue under its wave's milestone. It works one way,
// like the issues. A milestone the waves file does not list is a person's, and left alone. One the mirror made carries
// its banner. Once no wave holds it, as when a wave is renamed, it is closed, never deleted.
// The calls are REST, through `gh api`, with the workflow's own token (issues: write).

/** The time of day a milestone is due at: midday UTC, so GitHub shows the same day in any time zone near it. */
const DUE_AT = 'T12:00:00Z';

const plain = (text) =>
  String(text ?? '')
    .replaceAll('\r\n', '\n')
    .trim();

/** What to send GitHub for a milestone: its title, description, due day and state. */
export const fieldsOf = (m) => ({
  title: m.title,
  description: m.description,
  due_on: `${m.dueOn}${DUE_AT}`,
  state: m.state,
});

import { MILESTONE_BANNER } from './github-project-waves.mjs';

/**
 * The milestones to make, to change and to close: {create: [milestone], update: [{number, milestone}], retire:
 * [number]}. `wanted` are the
 * milestones as milestonesOf gives them. `have` are GitHub's, as its REST API gives them ({number, title, description,
 * due_on, state}). A milestone is matched by its title. Its due day is compared by the day alone. One still open that
 * the mirror made (its description holds the banner) and that is no longer wanted is retired.
 */
export function planMilestones(wanted, have) {
  const byTitle = new Map(have.map((m) => [m.title, m]));
  const create = [];
  const update = [];
  for (const m of wanted) {
    const now = byTitle.get(m.title);
    if (!now) {
      create.push(m);
      continue;
    }
    const differs =
      plain(now.description) !== plain(m.description) ||
      String(now.due_on ?? '').slice(0, 10) !== m.dueOn ||
      now.state !== m.state;
    if (differs) update.push({ number: now.number, milestone: m });
  }
  const titles = new Set(wanted.map((m) => m.title));
  const retire = have
    .filter((m) => !titles.has(m.title) && m.state === 'open' && String(m.description ?? '').includes(MILESTONE_BANNER))
    .map((m) => m.number);
  return { create, update, retire };
}

/**
 * The issues to file under another milestone: [{number, milestone (a title, or null for none)}]. `issues` are the
 * desired ones; one with no `milestone` key is left as it is. `known` maps an id to its issue ({number}). `current`
 * maps an issue's number to the title of its milestone now. An issue just made has none.
 */
export function planFiling(issues, known, current) {
  const moves = [];
  for (const issue of issues) {
    if (issue.milestone === undefined || !known[issue.id]) continue;
    const number = known[issue.id].number;
    if ((current.get(number) ?? null) !== issue.milestone) moves.push({ number, milestone: issue.milestone });
  }
  return moves;
}

/**
 * The most issues a run files under a milestone. GitHub allows about 500 changes an hour. So a first run that files
 * every issue is spread over a few pushes to main, each going on from what GitHub then holds.
 */
export const MAX_FILINGS = 250;

/** Every milestone of `repo`, open or closed, as GitHub's REST API gives them. */
export function readMilestones(read, repo) {
  return JSON.parse(read(['api', `repos/${repo}/milestones?state=all&per_page=100`, '--paginate', '--slurp'])).flat();
}

/**
 * Makes and changes the milestones `desired.milestones` gives, then files each issue under its own. `act` makes the
 * changes and `read` reads (both runners as executePlan of github-project-gh.mjs paces them); `repo` is `owner/name`.
 * `known` maps an id to its issue ({number}) and `current` an issue's number to its milestone's title now. It files at
 * most `cap` issues. Gives the counts {created, updated, filed, left, retired}. `left` is the issues kept for the next run. Milestones
 * no longer wanted are retired only once none are left.
 */
export function keepMilestones(act, read, repo, desired, known, current, cap = MAX_FILINGS) {
  const have = readMilestones(read, repo);
  const { create, update, retire } = planMilestones(desired.milestones, have);
  const numbers = new Map(have.map((m) => [m.title, m.number]));
  const send = (path, method, body) =>
    JSON.parse(act(['api', `repos/${repo}/${path}`, '--method', method, '--input', '-'], JSON.stringify(body)) || '{}');
  for (const m of create) numbers.set(m.title, send('milestones', 'POST', fieldsOf(m)).number);
  for (const u of update) send(`milestones/${u.number}`, 'PATCH', fieldsOf(u.milestone));
  const moves = planFiling(desired.issues, known, current);
  const now = moves.slice(0, cap);
  for (const f of now)
    send(`issues/${f.number}`, 'PATCH', { milestone: f.milestone === null ? null : numbers.get(f.milestone) });
  const left = moves.length - now.length;
  // a milestone no wave holds is closed only once its issues have all moved on
  const retired = left ? [] : retire;
  for (const number of retired) send(`milestones/${number}`, 'PATCH', { state: 'closed' });
  return { created: create.length, updated: update.length, filed: now.length, left, retired: retired.length };
}
