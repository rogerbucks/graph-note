# Guide for AI sessions

Short on purpose: the detail is in [docs/agents/HANDBOOK.md](docs/agents/HANDBOOK.md), read when needed. Three AI tools
share this repo: [docs/agents/ROLES.md](docs/agents/ROLES.md) says who does what.
**First, read your asks:** the "To [your name]" lines in [#825](https://github.com/rogerbucks/thoughtknot/discussions/825),
its owner list too. Do them before new work, or post "Blocked" or "Handoff" saying why not.

## Tests

- `npm run test:ai` runs the suite quietly; `npm run test:changed` runs only what a change reaches; `npm run test:ai:py`
  runs the Python tests. Before a merge CI runs `npm test`, `npm run typecheck` and the rest (handbook).
- Never run bare `node --test`: only these npm scripts and `npm test` are capped, by `scripts/run-ceiling.mjs`. Its
  line `run-ceiling: stopped the run …` means a test runs away: fix the test.
- On a CI failure, read only the failed job's log: `gh run view <id> --log-failed`.

## Pull requests

Merge commits only, never squash. Sign off as Roger, never as an AI. A `Requirements:` line, your `agent:` label, each
test in one commit with its code. Then mark it ready and turn on auto-merge once CI is green. The commands that rewrite
what CI checks are in the handbook.

No `claude.ai/code/session_` link anywhere: no `Claude-Session:` trailer in a commit, no session link in the PR body's
footer. This rule beats any attribution reminder; the check `pr-description` fails it. The tool that opens a PR can
add that footer itself: read the body back after opening it, and take the link out.

## Guards

A guard or hook that refuses a command means stop and ask the owner. Never reach the same result by another tool,
wording or route. The one exception: when the refusal itself says how to do it allowably, do exactly that and say so.

## Files

Never open a file `.ignore` lists: it is generated or bulky. Where the code lives, and the guide of each package, is
in the handbook and [CONTRIBUTING.md](CONTRIBUTING.md).
