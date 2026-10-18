# Z-10 One set of zoom controls

**You should see:** only the ThoughtKnot bar's controls on the drawing. The Mermaid Zoom plugin, if it is installed, does not add its own zoom buttons over a graph drawing.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. Install and switch on the Mermaid Zoom community plugin in a vault you can throw away. The test vault turns on ThoughtKnot only.
2. Open this note and look at the drawing.
3. Count the sets of zoom controls: there should be one.

**Checklist line:**

> **Z-10** Only one set of zoom controls appears: the Mermaid Zoom plugin does not add its own to a graph drawing.

**Back to the checklist:** [Z-10 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-10 in its list.
