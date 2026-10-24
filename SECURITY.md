# Security policy

Thank you for helping keep ThoughtKnot and its users safe.

## Supported versions

Fixes go into the newest release. Please update before you report.

| Version                            | Gets security fixes          |
| ---------------------------------- | ---------------------------- |
| The latest stable release          | Yes                          |
| Nightly pre-releases               | Yes, in the next nightly     |
| Any older release                  | No. Please update.           |

## How to report a problem

Please report it in private. Do not open a public issue, discussion or pull request about it.

1. Go to [Report a vulnerability](https://github.com/rogerbucks/thoughtknot/security/advisories/new).
2. Say what you found, where it is, and which version you used.
3. Add the steps to show it, if you can.

Only the maintainer sees your report. If you cannot use GitHub, open an issue that asks for a private way to talk. Leave
out every detail of the problem.

## What happens next

- **Within 7 days:** you hear back that your report has arrived.
- **Within 14 days:** you hear whether it is a real problem and how serious it is.
- **Within 90 days:** a fix is released, or you hear why it takes longer.

You are kept up to date until it is fixed. When the fix is out, a public advisory explains the problem. You are thanked
by name in it, unless you would rather not be.

ThoughtKnot is run by one person in their own time. These times are a promise to try hard, not a contract.

## What counts

In scope:

- The Obsidian plugin, the standalone app and the JavaScript and Python libraries in this repository.
- The build, the release and the GitHub workflows that make them.

Out of scope:

- A problem in Obsidian itself, or in another plugin. Please report it to its own makers.
- A problem in a library we use. Please report it to that library first, then tell us.

## Testing in good faith

Test only on your own notes and your own machine. Do not touch other people's data. If you keep to this policy, we
will not take action against you.

## How the project deals with a problem

The steps, the ranks and the response times we aim for are on the [Security response](https://github.com/rogerbucks/thoughtknot/wiki/Security-response) page.

## How the project keeps itself safe

- Dependabot raises a security fix as soon as one is published.
- GitHub scans each push for secrets and blocks one that leaks.
- CodeQL checks the code on each pull request and each week.
