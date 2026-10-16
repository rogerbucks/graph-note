# Working with an AI (spec §19), classification gates, and settings (spec §21)

Purpose: sending a note's graph to an AI (what may be sent, to which model, under which classification), the Claude gate, and the settings that govern these and the rest. Part of the [core guide](../GUIDE.md).

## Working with an AI (spec §19)

The core reaches no network: a send goes only through the transport a host hands in, and only once the user has seen
exactly what goes and said yes to it. Its answer comes back as a proposal (§17), never an edit.

- `ai.ts` — the send: `prepareSend` makes the exact request for what the user chose, or refuses (AI off, no such model,
  an address that cannot be used, above the model's ceiling, at the highest classification, or holding a credential);
  `confirmSend` is the user's yes to exactly that request, good for one send; `sendPrepared` sends it through the host's
  `Transport`, putting the key from the host's secret store in its header only as it goes and taking it out of anything
  said before it is cut short, and gives back a proposal or why there is none, with a `SendRecord` of the send either
  way: never the text sent, only its SHA-256 digest and size, its scope (the kind of choice and the counts), the model's
  name and address, the time and the outcome. The model is copied as it is prepared, so what is sent is what was shown.
  The address and the whole message are looked over for credentials before they are put in the request.
- `ai-digest.ts` — `sha256` and `utf8Size`, written here, as the core has no host's library; a lone surrogate is taken
  as U+FFFD, as a UTF-8 encoder sends it.
- `ai-choice.ts` — which AI may be asked: `aiReady` (off until `aiUse` is on and a model has a name, a model and a
  usable address), `endpointProblem` (a host written in letters, digits, dots, hyphens, colons and brackets only, so it
  cannot be told apart from another; no user name, password, query string or fragment; plain http only to localhost,
  127.x.x.x or [::1] exactly, read with the runtime's own URL; any other by https), and `modelChoices` (the host's own
  AI first, where it has one; then the models set up for the purpose; then the rest; none while AI is off).
  `AI_PURPOSES` are the spec's purposes.
- `ai-ceiling.ts` — `clearance`: a note with no classification counts as `aiUnlabelled`, the most sensitive level
  until the user chooses another (unclassified_strictest), so by default it goes to no model, and the refusal says to
  give it a classification or choose a lower level under Unlabelled notes count as; a note above a
  model's ceiling is not sent to it, saying why and naming the models cleared for it; nothing at the highest
  classification set goes to any model; an unknown classification counts above every ceiling. `credentialsIn` names, by
  common patterns, the kinds of credential a text holds (a private key, an access key, an API key, a token, a password
  or secret by its name, even at the end of a snake_case or camelCase one, though a bare `key` is an ordinary word and
  only a name ending in `_key` or `Key` is a secret's, a card number, or the key of any model set up), never
  the text.
- `ai-matrix.ts` — a model's row of the destination matrix (model_ceiling). The host reads the matrix note and hands
  the core plain `MatrixRow`s (a mark, yes, conditional or no, for each class), so the core never reads the note's
  layout. A model with a `matrixRow` picked by the user, never guessed from its name or address, may receive exactly
  the classes the row marks yes, and each conditional class only once its name is in the model's `matrixOn`; a no is
  never allowed, and the highest classification never goes to any model. `matchClass` matches a class to a
  classification by name, else through `aiClassMap`; one matched by neither is flagged (`unmatchedClasses`), never
  guessed, and never allowed. `matrixGrants` lists a row's classes for the settings page, with the condition to show
  beside each switch. `clearance` takes the matrix as its last argument and, for a model with a row, uses it in place
  of the ceiling; with no row the ceiling stands. `classMapFrom` and `classMapText` keep the mapping table as text.
  Nothing fails open: a row named twice, or two columns standing for one classification, refuses (`matrixProblems`
  flags them); a switch (`matrixOn`) keeps the condition it was turned on under and is dropped when the note's words
  change or the cell is no longer conditional; a cell not exactly ✅, ⚠️ or ❌ is `unknown` and refuses; names are
  compared exactly, so a compatibility character never matches; a table that disagrees with itself or with a name
  matches nothing (`classMapProblems`).
- `src/hosts/` — host-side code, kept apart from the core proper. `hosts/matrix-table.ts` is reached as `@graph-note/core/hosts/matrix-table` (not from the entry) and
  imported by no gate or other core module (`hosts-boundary.test.js`): `matrixRows`, the one reader of the matrix note's
  table, for the hosts that read the note (Obsidian and the Claude Code mod); the gates are only ever handed its rows. `matrixRowsFrom` checks rows handed over
  as data, and takes none at all if anything in them is not a row.
- `settings-matrix.ts` — the two options of the matrix, the note that holds it and the table of class names (`MATRIX_OPTIONS`).
- `claude-gate.ts` — `claudeGate` (spec §26, cc_classified_asks, cc_credential_never): whether a note may open in the
  browser editor's pane, which Claude can read. `{ open }`; `{ ask }` for a note above Claude's ceiling (the ceiling of
  the AI model named Claude, else the lowest classification); `{ refuse }` for one at the highest classification, one
  with a classification not among those set, one with none when `aiUnlabelled` is the highest (the default), and
  one holding a credential at any classification. The words name kinds and levels, never the note's label or text. A
  third argument, the SHA-256 of a text, is the user's yes to that text alone. `classificationOf` reads the one
  unindented top-level front matter `classification:` key; several, a list, mapping, block, anchor, tag, open quote or an
  empty value with child lines are `unknown`, which refuses (`noteClassification` gives the label or null). The ceiling
  of the model named Claude is cleared by its matrix row when one is picked (the host hands the rows as `matrix`),
  else by its ceiling.
- `ai-scope.ts` — `aiScope`: what is sent of a note, as the user chose (the whole graph, a view, or things by name),
  written out again as GQL from the graph as read: each thing with its kinds and properties, and the links between the
  things chosen. Nothing else of the note goes: no prose, no other graph, no comment.
- `ai-request.ts` — the request body, in the chat completions shape local servers and most services take, with the
  instructions that ask for changes as JSON (`INSTRUCTIONS`); `readReply` and `changesIn` read an answer back, the whole
  answer refused if one change cannot be read. A model's reason is kept as plain text, each Markdown and HTML mark
  escaped, so it never renders as an image, a link or HTML where `///` notes are rendered.
- `ai-answer.ts` — `proposalFrom`: the changes made into a proposal from the model, against the state of the graph that
  was sent, naming the send's record; `noteWithProposal`: the note with its change set written after the graph's last
  block, the graph untouched.

## Settings (spec §21)

- `strictness.ts` — the three departures from standard GQL the reader reads as meant (each problem says which, in
  `Problem.departure`), what Standard, Forgiving and Simplified make of them, converting a note back to standard GQL,
  checked before it is written, and the standard text an engine or an export is given whatever the level.
- `settings.ts` — every option with its name, sentence, choices and default (`OPTIONS`, `DEFAULT_SETTINGS`), and saved
  settings read back with anything unknown, out of range or secret left out (`settingsFrom`). AI is off until `aiUse`
  is turned on; `aiUnlabelled`, the level a note with no classification counts as, is one of `classifications`, the
  most sensitive until chosen. An AI model keeps the name of its key in the host's secret store (`keyName`), never the key. The Export section holds the export theme (light
  or dark), whether an export saved in the vault gets a companion note, the folder exports go to (`vaultFolder`, in
  `vault-folder.ts`, keeps it
  inside the vault; empty is next to the note) and the classification above which an export asks first (one of
  `classifications`, the lowest until chosen). The Drawing section also holds how far focus reaches from a selected
  thing (`focusDepth`: `one`, the default, or `two`; `depthOf` reads it), and the default of each View menu switch
  (`labelsByZoom` and `foldHubs` on, `foldGroups` and `mergeLinks` off, view_switch_defaults). The Proposals section
  holds `decider`, the name recorded when you accept or reject a change, as typed on one line (decider_named).
