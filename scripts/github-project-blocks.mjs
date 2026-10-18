// The blocked-by links of the GitHub mirror (spec §12, requirements_checked_in_ci): each open question's issue is marked,
// with GitHub's own issue dependencies, as blocking the issues of the requirements it blocks, so the public project shows
// what waits on what. One way, like the issues: a link from a question's issue to another mirrored issue that the
// requirements copy no longer gives is removed; a link to or from any issue the mirror did not make is a person's, and kept.
// The calls are REST, through `gh api`, with the workflow's own token (issues: write).

/**
 * The links to make and to remove, as issue numbers: {add: [{blocker, blocked}], remove: [{blocker, blocked}]}. `issues`
 * are the desired issues, each question's with the requirement ids it `blocks`; `known` maps an id to its issue ({number});
 * `blocking` maps each question issue's number to the numbers of the issues GitHub has it blocking now.
 */
export function planBlocks(issues, known, blocking) {
  const mirrored = new Set(Object.values(known).map((i) => i.number));
  const add = [];
  const remove = [];
  for (const issue of issues) {
    if (!issue.blocks || !known[issue.id]) continue;
    const blocker = known[issue.id].number;
    const wanted = issue.blocks.filter((id) => known[id]).map((id) => known[id].number);
    const now = blocking.get(blocker) ?? [];
    for (const blocked of wanted) if (!now.includes(blocked)) add.push({ blocker, blocked });
    for (const blocked of now)
      if (mirrored.has(blocked) && !wanted.includes(blocked)) remove.push({ blocker, blocked });
  }
  return { add, remove };
}

/**
 * Reads what each question's issue blocks on GitHub and makes or removes the links planBlocks gives. `act` makes the
 * changes and `read` reads (both runners as executePlan of github-project-gh.mjs paces them); `repo` is `owner/name`.
 */
export function linkBlocks(act, read, repo, issues, known) {
  const api = (path) => JSON.parse(read(['api', `repos/${repo}/issues/${path}`]));
  const questions = issues.filter((i) => i.blocks && known[i.id]).map((i) => known[i.id].number);
  const blocking = new Map(
    questions.map((n) => [n, api(`${n}/dependencies/blocking?per_page=100`).map((i) => i.number)]),
  );
  const { add, remove } = planBlocks(issues, known, blocking);
  const restIds = new Map();
  const restId = (n) => restIds.get(n) ?? restIds.set(n, api(String(n)).id).get(n);
  for (const { blocker, blocked } of add)
    act([
      'api',
      `repos/${repo}/issues/${blocked}/dependencies/blocked_by`,
      '--method',
      'POST',
      '-F',
      `issue_id=${restId(blocker)}`,
    ]);
  for (const { blocker, blocked } of remove)
    act(['api', `repos/${repo}/issues/${blocked}/dependencies/blocked_by/${restId(blocker)}`, '--method', 'DELETE']);
}
