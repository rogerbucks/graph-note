# Security response

How ThoughtKnot spots a security problem and deals with it straight away. This is spec section 66, workstream SR1,
planned before the Obsidian community release (R2). It builds on the daily scan, the release gate and the
[trust model](Trust-model).

**One person runs this project.** ThoughtKnot keeps your notes on your own machine and sends nothing home, so nobody
watches users live. We find problems three ways: our own scans, public advisories and what people tell us.

## In one picture

```
 SPOT ──▶ LOG ──▶ RANK ──▶ CONTAIN ──▶ FIX ──▶ RELEASE ──▶ TELL ──▶ LEARN
 scan     one      sev.     stop the    branch   nightly     advisory  note +
 report   issue    + owner  bleeding    + test   then stable + credit  new rule
```

## 1. Where problems come from

| Source | What it catches | How often | Where it lives |
|---|---|---|---|
| Daily scan | Code scanning, Dependabot, secret scanning, npm audit, OSV | Daily, 06:00 UTC | `.github/workflows/security.yml` |
| Dependabot | A fix PR as soon as an advisory is published | On publish | `.github/dependabot.yml` |
| Dependency review | A pull request that adds a risky package | Each PR | `.github/workflows/dependency-review.yml` |
| Engine advisories | Graphviz inside the layout engine | Mondays | `.github/workflows/engine-advisories.yml` |
| Release gate | Any open alert at release time | Each release and nightly | `.github/workflows/release.yml`, `.github/workflows/nightly.yml` |
| Private report | Anyone who finds a problem | Any time | [Report a vulnerability](https://github.com/rogerbucks/thoughtknot/security/advisories/new) |
| Obsidian review and community | Reports from Obsidian's team or other plug-in authors | Any time | Route to a private report (section 3) |

No source looks at your notes or your use. That is on purpose.

## 2. How serious, and how fast

Roger ranks each problem. The clock starts when we first see it.

| Level | Looks like | Look within | Fix out within |
|---|---|---|---|
| **Critical** | A leaked secret. Code runs from a note or plug-in without a yes. Notes leave the machine. | 24 hours | 3 days, as a nightly |
| **High** | A way to read or change notes by tricking the person. A signed or published build tampered with. | 2 days | 7 days |
| **Medium** | Needs an unusual setup. Limited damage. | 7 days | Next stable release |
| **Low** | Hardening. No known way to use it. | 14 days | 90 days |

Reporters get the longer promises in [SECURITY.md](https://github.com/rogerbucks/thoughtknot/blob/main/SECURITY.md):
7 days to hear back, 14 to hear the rank, 90 for a fix. The table above is what we aim for inside that.

## 3. Who does what

| Step | Who | What |
|---|---|---|
| Spot | The scans and the reports | See section 1. |
| Log | The daily workflow | One issue labelled `security`. Each alert shows its key, severity and link only. The repository is public, so details stay in the Security tab. |
| Rank | Roger | Picks the level and the owner. A Claude thread proposes. |
| Contain | Roger | Needs a person. Revoke a leaked secret first. Mark a bad pre-release as withdrawn. Pause nightlies if they carry the problem. |
| Fix | A Claude thread | One `security/...` branch, a test that fails before the fix, and a rule that keeps the kind of problem out (`prevented_by` in the risk register). |
| Release | Roger | Merge, then the nightly carries the fix. A stable release waits for a clean gate. Roger pushes the release tag. |
| Tell | Roger | Publish the GitHub advisory when the fix is out. Thank the reporter by name unless they decline. |
| Learn | A Claude thread | A post-incident note (section 5) within 7 days. |

**Hard rules**

- Never release with an open alert the register has not accepted. Stable: any alert. Nightly: high or critical.
- Never post details of an open problem in a public issue, pull request, discussion or log.
- A public post about a problem: hide it, ask the reporter to use the private form, and treat it as already known.
- A fix is not done until its test and its rule are merged.

## 4. If it is…

- **A leaked secret:** revoke it at its source first. Then clean up. Then log it.
- **A bad release:** mark it withdrawn on GitHub, ship a fixed nightly, say so in the advisory.
- **A problem in a library we use:** update it. If no fix exists, report it upstream and record it as an accepted risk
  with a review date.
- **A report from outside:** reply within 7 days, rank it within 14, keep the reporter told.

## 5. Post-incident note

Short. Keep it in the advisory or the risk register entry.

```
What happened:
When we saw it / when it was fixed:
Who or what found it:
What it could have done:
Which test and rule now stop it:
What would have found it sooner:
```

## 6. Practice runs

Before R2, run the protocol once on a made-up problem: spot, rank, fix on a branch, release as a nightly, write the note.
Record each run here.

| Date | What we practised | What we fixed in this page |
|---|---|---|
| _not yet run_ | | |

## 7. Set up once

- Private vulnerability reporting is on (confirmed by Roger, 24 Oct 2026).
- Add the optional secret `SECURITY_ALERTS_TOKEN`: a fine-grained token on this repository with read-only access to
  Dependabot, secret scanning and code scanning alerts. It stops working on 24 October 2027, so renew it by 17 October 2027. Without it the daily scan cannot read Dependabot or secret-scanning
  alerts.
- Keep GitHub security emails on, for the quickest sight of an alert.
