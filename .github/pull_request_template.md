Requirements: <!-- the spec's requirement ids this builds, such as words_catalogue -->

## What changes

Before:

After:

## How

## Checks

- [ ] The label for your agent is set: `agent:claude` or `agent:antigravity`.
- [ ] No private session link, here or in a commit (`Claude-Session:` and its link).
- [ ] The requirement is in `requirements/editor-requirements.md` first, and its test was seen failing first: the test
      and its code in one commit, then `node scripts/tests-first.mjs --update`. If no test can fail first, add a line
      `Tests first:` saying why.
- [ ] Every commit is signed off by a person: `git commit -s`, or Roger's line for a commit any AI agent writes (CONTRIBUTING.md).
- [ ] `npm test`, `npm run typecheck`, `npm run lint` and `npm run format:check` pass.
