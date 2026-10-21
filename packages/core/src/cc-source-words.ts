// The Claude Code mod's own words, in UK English (editor spec §10, §26 and §42, words_catalogue). They are what the pane
// and the /graph command say to the person. That is the drawing's words, why it is text, and how the editor opened or
// stopped.
// They are also the guards' refusals and the propose tool's answers. Those go to Claude, but Claude Code shows them in
// the chat too, so the person may read them. What the mod tells Claude alone stays in the code
// (words-in-code.test.js). source-words.ts keeps these with every other word.

/** The Claude Code mod's own words, by key, in UK English. */
export const CC_SOURCE_WORDS = {
  'cc.no-graph': 'No graph in this note.',
  'cc.empty-graph': 'The graph in this note has nothing in it yet.',
  'cc.instead': 'It is shown as text instead.',
  'cc.not-drawn': 'Not drawn. {instead}',
  'cc.too-large-to-read': 'Too large to read: the graph blocks here hold {size} {unit}, and at most {most} are read.',
  'cc.unit.bytes': 'bytes',
  'cc.unit.lines': 'lines',
  'cc.unit.source': 'bytes of drawing instructions',
  'cc.unit.word': 'characters in a word',
  'cc.too-large-to-draw': 'Too large to draw: this graph has {size} {what}, and at most {most} are drawn. {instead}',
  'cc.at-least': 'at least {size}',
  'cc.title.too-large': 'Too large',
  'cc.title.empty': 'Empty',
  'cc.title.no-graph': 'No graph',
  'cc.title.not-read': 'Not read',
  'cc.not-read': 'The graph could not be read.',
  'cc.problem-line': 'Line {line}: {message}',
  'cc.alt': '{graph}: {things}, {links}',
  'cc.things': { one: '{count} thing', other: '{count} things' },
  'cc.links': { one: '{count} link', other: '{count} links' },
  'cc.too-large-for-pane': 'The drawing is too large for a pane (over {most} characters). {instead}',
  'cc.node-missing':
    'Graphviz runs through Node.js, and node could not be started. Install Node.js 24 or later (nodejs.org), make sure `node` is on the path Claude Code starts with, and run /graph again. The graph is shown as text meanwhile.',
  'cc.node-failed': 'Could not run node: {why}',
  'cc.graphviz-unfinished': 'Graphviz did not finish: {why}',
  'cc.graphviz-failed': 'Graphviz failed: {why}',
  'cc.exit-code': 'exit code {code}',
  'cc.graphviz-too-large': 'The drawing was too large to hand back from Graphviz.',
  'cc.graphviz-no-drawing': 'Graphviz gave no drawing: its output was not one SVG for each layout.',
  'cc.editor.no-node':
    'Node could not be started, and the editor needs it. Install Node.js, make sure `node` is on the path, then try again.',
  'cc.editor.none-open': 'No editor is open: /graph edit <path to a note> opens one.',
  'cc.editor.no-proposals': 'Proposals are not available: this host cannot make the key one needs.',
  'cc.editor.nothing-waiting': 'Nothing is waiting for a yes: /graph edit <path to a note> asks first.',
  'cc.editor.unchecked':
    'The note or the settings could not be read, so it cannot be checked against the level set for Claude.',
  'cc.editor.nothing-asks': '{note}: nothing asks about this note now.',
  'cc.editor.name-note': 'Name a note to edit: /graph edit <path to a note>, quoted if it has spaces.',
  'cc.editor.raised': 'the note is now above the level set for Claude',
  'cc.editor.other-note': 'another note was opened',
  'cc.editor.not-ready': 'The editor server did not become ready in {seconds} seconds.',
  'cc.editor.no-address': 'The editor server did not hand over an address.',
  'cc.editor.server-failed': 'the editor server failed: {why}',
  'cc.editor.signal': 'signal {signal}',
  'cc.editor.signal-unknown': 'unknown',
  'cc.editor.stopped-early': 'The editor server stopped before it was ready ({code}).',
  'cc.editor.ended-by': 'ended by {signal}',
  'cc.editor.exited': 'exited with code {code}',
  'cc.editor.not-the-person':
    'Only the person typing can say yes to opening a note above the level set for Claude: a command from anything else is refused.',
  'cc.editor.not-the-person-asking':
    'Only the person typing can say yes to that, and this command did not come from them, so it is not opened.',
  'cc.editor.already-open':
    'The editor is already open for {title}. The link to open in the browser pane is in the Graph editor pane, and is not shown here.',
  'cc.editor.ready':
    'The editor is ready for {title}. The link to open in the browser pane is in the Graph editor pane, and is not shown here.',
  'cc.editor.asks':
    '{why} Nothing was opened or shown. Say /graph confirm to open it anyway; anything else leaves it closed.',
  'cc.editor.refused': '{why} Nothing was opened or shown.',
  'cc.editor.not-started': 'The editor was not started: {why} The drawing /graph gives is shown instead.',
  'cc.editor.stopped': 'The editor stopped: {reason}.',
  'cc.matrix.outside-settings':
    'The matrix note named in the settings is not a path inside the vault, so it is not read.',
  'cc.matrix.cannot-tell': 'This host cannot tell whether the matrix note is inside the vault, so it is not read.',
  'cc.matrix.outside-real': 'The matrix note is, by its real path, outside the vault, so it is not read.',
  'cc.matrix.no-real-path': 'The real path of the matrix note could not be found, so it is not read.',
  'cc.matrix.unreadable': 'The matrix note could not be read.',
  'cc.command': 'Draw a graph note’s first graph in a pane',
  'cc.usage': 'Name a note to draw: /graph <path to a note>, quoted if it has spaces.',
  'cc.no-pictures': 'This surface cannot draw pictures, so the graph is shown as text. The desktop app draws it.',
  'cc.could-not-read': 'Could not read {path}: {why}',
  'cc.refused-not-drawn': '{why} Nothing was drawn.',
  'cc.asks-not-drawn': '{why} Nothing was drawn: /graph edit {path} asks first.',
  'cc.pane-title': 'Graph: {title}',
  'cc.shown-as-text': '{alt} — shown as text. {why}',
  'cc.editor.usage': 'No editor is running. /graph edit <path to a note> starts one.',
  'cc.editor.pane-title': 'Graph editor',
  'cc.editor.open-address': 'Open this address in the browser pane to edit the note:',
  'cc.editor.open-link': 'Open the graph editor',
  'cc.editor.copy': 'Copy the address',
  'cc.editor.secret': 'It holds a secret for this session only. It stops when the session ends, or /graph stop.',
  'cc.undo-over-theirs':
    'Another program changed this graph block since your last change here, so undoing now would undo its change too. Nothing was undone.',
  // the guards' refusals (data-guard.ts, gate-guard.ts): each names no path, command or text of the call
  'cc.refusal.data-folder':
    'thoughtknot: this is the mod’s data folder, which holds the settings ({settings}) that decide what Claude ' +
    'may open, so Claude may not write to it. The user changes these settings, by editing {settings} in the ' +
    'thoughtknot plugin data folder ({variable}, or else the plugins data folder under their Claude config ' +
    'folder). Nothing was changed.',
  'cc.refusal.data-check-failed':
    'thoughtknot: this call was refused because the guard for the mod’s data folder could not check where it ' +
    'leads (node could not be run, or did not answer). Nothing was changed. Try again, or ask the user.',
  'cc.refusal.open-note':
    'thoughtknot: this note is open in the ThoughtKnot editor, so Claude may not change it with its own tools. ' +
    'Propose the change with the propose tool ({tool}) instead: the user accepts or rejects it on ' +
    'the card. Reading the note with Read stays allowed. Nothing was changed.',
  'cc.refusal.note-check-failed':
    'thoughtknot: this call was refused because the guard for the note open in the ThoughtKnot editor could not check ' +
    'where it leads (node could not be run, or did not answer). Nothing was changed. Propose the change with the ' +
    'propose tool ({tool}), or ask the user.',
  'cc.refusal.matrix-note':
    'thoughtknot: this is the matrix note named in the settings, which sets what Claude may open, so Claude may not ' +
    'change it. The user edits it in their vault. Nothing was changed.',
  'cc.refusal.classification':
    'thoughtknot: this call would change a note’s classification, which sets what Claude may open, so Claude may not ' +
    'make it. Ask the user to change the classification in the note themselves. Nothing was changed.',
  'cc.refusal.gate-check-failed':
    'thoughtknot: this call was refused because the guard for what sets Claude’s gate could not check where it leads ' +
    '(node could not be run, or did not answer). Nothing was changed. Try again, or ask the user.',
  // the propose tool's answers (editor-propose.ts)
  'cc.propose.made': {
    one: "Proposed {count} change as {id}. Nothing was applied: the proposal waits on the card in the editor, and only the user's accept applies it.",
    other:
      "Proposed {count} changes as {id}. Nothing was applied: the proposal waits on the card in the editor, and only the user's accept applies it.",
  },
  'cc.propose.refused': 'The proposal was refused: {why}. Nothing was written.',
  'cc.propose.unreached': 'The editor could not be reached.',
  'cc.propose.status': 'The editor said {status}.',
  'cc.propose.no-account': 'The editor gave no account of the proposal.',
} as const;
