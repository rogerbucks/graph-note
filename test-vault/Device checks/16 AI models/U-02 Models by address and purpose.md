# U-02 Models by address and purpose

**You should see:** two models set up in the settings, each by its own address: one on this device for proposing changes, one remote for research questions with its key chosen in the app's own key field. A remote address written with plain http is said on its model's row to need https. In the dialog the model for proposing changes is offered first, and the plugin's data.json holds the key's name, never the key.

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
1. In Settings, ThoughtKnot, AI models, turn Use AI models on and add a model: name it Local, purpose Proposing changes, model the name your local server gives it, endpoint `http://localhost:11434/v1/chat/completions` (Ollama) or your server's own address.
2. Add a second model: name it Remote, purpose Research questions, endpoint `http://api.example.com/v1/chat/completions`. Check its row says a model on another machine is reached over https only.
3. Change that endpoint to start with `https://`, and choose a throwaway test key with the key field (never a real one).
4. Run "Ask an AI model to propose changes". Check the Model list offers Local first, marked as for proposing changes.
5. Open the plugin's `data.json` in the vault's plugin folder. Check it holds the key's name and not the key.

**Checklist line:**

> **U-02** Set up two models: one on this device by `http://localhost`, for Proposing changes, and one by `https://`, for Research questions, its key chosen with the app's own key field. A remote address written with `http://` is said on its model's row to need https. In the dialog the model for proposing changes is offered first, and data.json holds the key's name, never the key.

**Back to the checklist:** [U-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for U-02 in its list.
