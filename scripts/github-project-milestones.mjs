// The milestones of the GitHub mirror (spec §41, plan_milestones). requirements/waves.json lists the milestones, each
// an outcome one step above the waves, and each wave names its own. The mirror makes the milestones, keeps their
// descriptions, due days and states, and files every requirement's issue under its wave's milestone. It works one way,
// like the issues. A milestone the waves file does not list is a person's, and left alone.
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

/**
 * The milestones to make and to change: {create: [milestone], update: [{number, milestone}]}. `wanted` are the
 * milestones as milestonesOf gives them. `have` are GitHub's, as its REST API gives them ({number, title, description,
 * due_on, state}). A milestone is matched by its title. Its due day is compared by the day alone.
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
  return { create, update };
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
 * most `cap` issues. Gives the counts {created, updated, filed, left}, `left` being the issues kept for the next run.
 */
export function keepMilestones(act, read, repo, desired, known, current, cap = MAX_FILINGS) {
  const have = readMilestones(read, repo);
  const { create, update } = planMilestones(desired.milestones, have);
  const numbers = new Map(have.map((m) => [m.title, m.number]));
  const send = (path, method, body) =>
    JSON.parse(act(['api', `repos/${repo}/${path}`, '--method', method, '--input', '-'], JSON.stringify(body)) || '{}');
  for (const m of create) numbers.set(m.title, send('milestones', 'POST', fieldsOf(m)).number);
  for (const u of update) send(`milestones/${u.number}`, 'PATCH', fieldsOf(u.milestone));
  const moves = planFiling(desired.issues, known, current);
  const now = moves.slice(0, cap);
  for (const f of now)
    send(`issues/${f.number}`, 'PATCH', { milestone: f.milestone === null ? null : numbers.get(f.milestone) });
  return { created: create.length, updated: update.length, filed: now.length, left: moves.length - now.length };
}
