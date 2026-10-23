# Translating ThoughtKnot

Thank you for helping. You need no code to translate ThoughtKnot. Each language is one plain file in this folder.

## What a file looks like

A file is named by its language tag, such as `fr.json` or `pt-BR.json`. It holds keys, each with its words:

```json
{
  "code.copied": "Copié",
  "find.found": { "one": "{count} chose trouvée.", "other": "{count} choses trouvées." }
}
```

- **Keys** stay as they are. Only change the words after them.
- **A placeholder** is a name in curly brackets, such as `{count}` or `{name}`. Keep every placeholder the source has.
  You may move it, but never rename, drop or add one.
- **Counts.** Some words change with a count. They have one form for each plural form your language has, such as
  `one`, `few`, `many` and `other`. Always give `other`.
- **Leave a word out** and it shows in UK English. It never shows as its key. So you can translate a little at a time.

## Start a language

1. In the repository folder, run `node scripts/translations.mjs --new fr`, with your language's tag in place of `fr`.
2. That makes `fr.json`, holding every word in UK English. Translate each one.
3. Delete any word you have not translated yet. It then shows in UK English and stays up to date.

## Check your file

1. Run `node scripts/translations.mjs`. It lists your file for the editor.
2. Run `npm run test:ai -- packages/core/test/words-files.test.js`. It says each key that is wrong, and why.
3. Open a pull request. CI runs the same check on every file.

## Where it shows

The editor speaks the language of the app it runs in: Obsidian's, or the system's. A person can also choose a language
in the settings. Each language with a file here is offered there, named in itself.
