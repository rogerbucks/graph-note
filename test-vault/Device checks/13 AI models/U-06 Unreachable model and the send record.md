# U-06 Unreachable model and the send record

**You should see:** a send to a model that cannot be reached ends with a notice saying so plainly, and that nothing was changed; the note is exactly as it was. Every send, a failed one too, is listed in the plugin's data.json with what was sent, the model, its address and the time, and never a key.

**Test diagram:**

```gql
// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(large_reader)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): the command writes its answer into the note, so it is refused in reading view.
1. Stop the local model's server (quit Ollama or LM Studio).
2. Run "Ask an AI model to propose changes", choose Local, press Show what will be sent, then Send.
3. Check a notice says Local could not be reached at its address and that nothing was changed, and this note is exactly as it was.
4. Open the plugin's `data.json` in the vault's plugin folder. Check `aiSends` lists this send as failed, with the body that was sent, the model, the address and the time, and that no key is anywhere in the file.

**Checklist line:**

> **U-06** Stop the local model's server and send: a notice says the model could not be reached and that nothing was changed, and the note is as it was. The plugin's data.json lists every send, failed ones too, with what was sent, the model and the time, and never a key.

**Back to the checklist:** [U-06 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for U-06 in its list.
