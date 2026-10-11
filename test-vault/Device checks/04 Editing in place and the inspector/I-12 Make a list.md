# I-12 Make a list

**You should see:** for the text property `tags: 'quiet, cheap'`, the icon's menu listing List after Text. Choosing it shows two fields, a kind and a relationship, filled in from the property's name and offering the kinds and relationships the graph already uses. Make list turns each value into a thing of that kind, linked from this one, and the property row becomes a row of chips. Cancel puts the field back, and one undo takes the whole change back. A thing with the same name that already exists is linked, not written again.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader', tags: 'quiet, cheap'}),
(large:Option {name: 'Large reader'}),
(quiet:Tag {name: 'quiet'}),
(small)-[:ANSWERS]->(question),
(large)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here and tap the Small reader box. Tap the icon beside tags and choose List.
2. Check the kind and relationship fields are filled in from the name (Tag, HAS_TAG) and offer the graph's own kinds and relationships.
3. Press Cancel and check the field comes back. Open it again and press Make list.
4. Check there are two chips, quiet and cheap; quiet links to the Tag thing already in the graph, and cheap is a new Tag.
5. Press undo once and check the whole change is taken back.

**Checklist line:**

> **I-12** A text property with several values (`tags: 'quiet, cheap'`): the icon's menu lists List after Text. Choosing it shows two fields, a kind and a relationship, filled in from the property's name and offering the kinds and relationships the graph already uses; Make list turns each value into a thing of that kind, linked from this one, and the property row becomes a row of chips. Cancel puts the field back. Undo (⌘Z, or the phone's gesture) takes the whole change back in one step. A thing with the same name that already exists is linked, not written again.

**Back to the checklist:** [I-12 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-12 in its list.
