# For developers

Where to start if you want to build ThoughtKnot, write a plug-in for it, or put it inside another app.

<!-- wiki:edition -->

## The big picture

ThoughtKnot is built in layers. Each layer uses only the ones below it, so a new app or plug-in is added on top without
changing what is underneath. The drawing below is made from
[`requirements/architecture.gql`](https://github.com/rogerbucks/thoughtknot/blob/main/requirements/architecture.gql),
which is itself a graph note. A dashed box is planned and not built yet, as ThoughtKnot draws a suggested thing.

<!-- wiki:architecture -->

More on each layer is on the [Architecture](Architecture) page.

## What do you want to do?

| I want to | Read |
|---|---|
| Understand how it fits together | [Architecture](Architecture) |
| Add an export, colours or, later, a diagram type | [Writing a plug-in](Writing-a-plug-in) |
| Put the editor inside another app | [Adding a host](Adding-a-host) |
| Look up a problem code, a version or a schema | [Developer reference](Developer-reference) |
| Read the graph format's rules, the § numbers the code cites | [`requirements/graph-spec.gql`](https://github.com/rogerbucks/thoughtknot/blob/main/requirements/graph-spec.gql) |
| Change ThoughtKnot itself | [CONTRIBUTING](https://github.com/rogerbucks/thoughtknot/blob/main/CONTRIBUTING.md) |

## Getting set up

You need Node 24 and, for the Python library, `uv`.

```sh
git clone https://github.com/rogerbucks/thoughtknot.git
cd thoughtknot
npm ci
npm run test:ai        # every JavaScript test, quietly
npm run test:changed   # only the tests your change reaches
npm run build          # the Obsidian plugin and the libraries
```

Before a pull request, run the full gate: `npm test`, `npm run typecheck`, `npm run lint` and `npm run format:check`.
CI runs them all again.

## How a change is made

1. **Spec.** Write the requirement in
   [`requirements/editor-requirements.md`](https://github.com/rogerbucks/thoughtknot/blob/main/requirements/editor-requirements.md).
2. **Test.** Write its test and see it fail. CI checks that each new test failed before its code existed.
3. **Code.** Write the code that makes it pass.
4. **Sign off.** Commit with `git commit -s`, and open a pull request.

## Versions

ThoughtKnot uses [semantic versions](https://semver.org), with one catch before 1.0.0. Then a step in the leftmost
part that is not 0 may change or remove what the library exports. So 0.7 to 0.8 may break your code. A patch step, such
as 0.8.0 to 0.8.1, never does. Each release's notes have a "Library changes" section. It lists what was added, changed
or removed.

## How these pages stay current

Every list and drawing on the developer pages is made from the code or the requirements each time main changes. The
interfaces, the extension points, the contract checks, the design tokens and the problem codes all come from the files
that define them. A marker shows where each item stands:

| Mark | Means |
|---|---|
| ✅ Released | In the latest release |
| 🌙 Nightly only | On main, in the nightly build, and in the next release |
| 🟡 Being built | Started, not yet proved by its tests |
| ⏳ Planned | In the requirements, not started |
