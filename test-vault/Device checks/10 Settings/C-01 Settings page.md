# C-01 Settings page

**You should see:** on the desktop and the phone, one Thoughtknot page in the plugin's settings, with Strictness, AI models, Formatting and Drawing, each option with a sentence saying what it does. Searching the settings for "strictness" finds it.

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

1. Open Settings, then Thoughtknot under Community plugins.
2. Check the page has Strictness, AI models, Formatting and Drawing, and that each option has a sentence beside it.
3. Go back to the settings search, type "strictness", and check the Thoughtknot option is found.
4. Repeat on the phone.

**Checklist line:**

> **C-01** Settings › Thoughtknot, desktop and phone: one page, with Strictness, AI models, Formatting and Drawing, each option with a sentence saying what it does. Searching the settings for "strictness" finds it.

**Back to the checklist:** [C-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for C-01 in its list.
