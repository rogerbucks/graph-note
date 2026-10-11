# C-04 AI models

**You should see:** a model added, named and described in the settings page, with a ceiling chosen and a key chosen in the app's own key field. When the page is closed and opened again everything is kept. The plugin's data.json in the vault holds the key's name only, never the key itself. This setting needs no graph, so the note holds only a small one to have open.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader'}),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. In Settings, Graph Note, AI models, press Add a model, then open Model 1.
2. Fill its name and purpose with dummy words, pick a ceiling, and choose a key with the key field (use a throwaway test key, never a real one).
3. Close the settings and reopen the page: everything should be kept.
4. Open the plugin's `data.json` in the vault's plugin folder and check it holds the key's name and not the key.

**Checklist line:**

> **C-04** AI models: Add a model, open Model 1, fill its name and purpose, pick a ceiling, and choose a key with the app's own key field. Close and reopen the page: all kept. The plugin's data.json in the vault holds the key's name, never the key (slice 2, settings_ai_models).

**Back to the checklist:** [C-04 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for C-04 in its list.
