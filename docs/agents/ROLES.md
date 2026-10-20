# Working group: who does what

Roger and three AI tools work on ThoughtKnot: Claude (Anthropic), Antigravity (Google) and graph-note (a Grok bot, by
xAI). This page is how they share the work. Every tool reads it before it starts. Roger decides anything it does not.

The tools cannot talk to each other. GitHub is the shared channel. Labels and branches say who has what, pull requests
carry the work, and the pinned "Working group" discussion carries the handoffs.

## The aim

The best result for the least cost. So:

- **Each tool does the work it is best and cheapest at.** The table below sets this.
- **One tool for each item.** Two tools on the same item pay twice for one result.
- **Claude's quota is the scarce one.** Roger pays a flat fee for it, and its weekly limit is the real cap. Keep Claude
  on building, and give checking and advice to the others.

Prices and limits change. When one changes, Roger updates this page.

## Who does what

| Who         | Does                                                                                                 | Branches        | Label               |
| ----------- | ---------------------------------------------------------------------------------------------------- | --------------- | ------------------- |
| Roger       | Plans and approves. His comment, such as "all good", is the only approval                            | —               | —                   |
| Claude      | Builds: spec, then test, then code. Drives each pull request to green. Fixes security alerts         | `claude/`       | `agent:claude`      |
| Antigravity | Tests: device and accessibility checks, test-vault journeys in its browser, `npm test` before merge  | `antigravity/`  | `agent:antigravity` |
| graph-note  | Advises: turns open questions and requirements into task lists, and reviews pull requests to the spec | none, read-only | `agent:graph-note`  |

- **Antigravity may build small items** on `antigravity/` branches, such as a fix its own testing found.
- **graph-note pushes no code.** It writes comments, reviews and task lists only. That keeps it cheap and out of the way.
- **When Claude's weekly use passes 80% before Friday**, Antigravity takes more of the small items. Roger writes that
  use in `requirements/capacity.json` each Sunday.

## Claiming work, so no two tools collide

1. **Check it is free.** No open pull request names the requirement, and no branch is named after it.
2. **Claim it with a draft pull request.** Its body has a `Requirements:` line naming what it builds. Add your label.
3. **One item, one branch, one pull request.** The branch prefix names the owner, such as `antigravity/812-reflow`.

- **A claim lapses after two days with no push.** Another tool may then take it, after a comment that says so.
- **Busy files.** Before you change `requirements/`, `CONTRIBUTING.md`, `AGENTS.md`, `package.json` or a workflow,
  look at the open pull requests that change it too. Keep your change small, and merge `main` in often.

## Handing work on

Comment in the pinned "Working group" discussion. Give the pull request's number, where the work stands, and who has it
next. Roger reads it there too.

## Reviewing each other

Each pull request gets three looks, each from a different tool, and each at little extra cost:

1. **Claude's review** runs on its own on every pull request that is not a draft (`claude-review.yml`).
2. **graph-note** reviews it against the spec, and labels its comments `agent:graph-note`.
3. **Antigravity** runs the tests and checks the change on screen before merge.

A reviewer comments and never pushes to another tool's branch. The owner fixes what is found. Roger gives the final
word.

## Rules every tool keeps

These are the repo's own rules. AGENTS.md and CONTRIBUTING.md hold the detail; this list is what most often goes wrong.

- **Read AGENTS.md first**, and never open the files it says never to read.
- **Spec, then test, then code.** A new test must fail before its code exists. Then run
  `node scripts/tests-first.mjs --update`.
- **Plain language for ADHD readers** in every doc and code comment. `node scripts/plain-docs.mjs <path>` lists what to
  fix. UK spelling.
- **Sign off as Roger.** Every commit an AI tool writes ends with
  `Signed-off-by: Roger Bucks <264575592+rogerbucks@users.noreply.github.com>`. Add it with `git commit --trailer`. CI
  refuses a commit whose sign-off names no person.
- **Always a pull request.** Open it as a draft. No one pushes to `main`.
- **Merge commits only**, never squash or rebase.
- **Roger approves.** His comment, such as "all good", is the approval. Only then turn on auto-merge, as a merge commit.
- **Security fixes keep their kind out.** Each one has a test that fails on the old code. It has a rule that stops the
  same kind of problem. And it has a risk in `quality/risks.json` that names both in `prevented_by`. `security/`
  branches belong to the Security workflow. An alert's details never go in a public issue: name its key, severity and
  link only.
- **No private links** in a commit message. A link to a private chat or workspace helps no reader of a public repo.
- **Nothing that spends Copilot credits.** Roger's credits ran out.
- **No new paid service** without Roger's word.
- **Hands off the release and the repo's settings.** Roger pushes release tags and changes the rules himself.
- **A guard that refuses means stop.** Ask Roger, and never reach the same result another way.
- **No secrets in the repo**, ever. `node scripts/check-classification.mjs --all` checks for personal details too.

## When a tool is stuck

Comment on the pull request and mention `@rogerbucks`. Say in one line what only Roger can do. Then say in the
discussion that the item is free, so another tool can pick it up if Roger wants.
