# Sample plug-in

A plug-in kept outside ThoughtKnot's packages, as one you write would be. It shows the smallest working shape of each
point it uses: a graph source, a diagram type, a command and a theme colour.

## How it runs

- It imports nothing from ThoughtKnot. A host runs it apart, in a worker with no network.
- Its manifest names each point with the version it was built for, such as `diagrams@1.0`.
- CI runs it that way and holds each thing it adds to that point's contract. The test is
  [`test/sample-plugin.test.js`](../../test/sample-plugin.test.js).

The guide to writing one is the wiki page "Writing a plug-in".
