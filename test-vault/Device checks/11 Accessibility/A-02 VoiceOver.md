# A-02 VoiceOver

**You should see:** with VoiceOver, the drawing described as a list of sentences, one for each link and each box, and a problem newly typed in the pane announced without the focus leaving the text.

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

1. Switch VoiceOver on and move to the drawing: listen to it described as a list of sentences.
2. Press Edit to open the pane and type a misspelt name, for example `(large)-[:ANSWERS]->(questoin)`.
3. Listen for the new problem to be announced, and check the focus stayed in the text.

**Checklist line:**

> **A-02** With VoiceOver: the drawing is described as a list of sentences, and a new problem typed in the pane is announced without the focus moving.

**Back to the checklist:** [A-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for A-02 in its list.
