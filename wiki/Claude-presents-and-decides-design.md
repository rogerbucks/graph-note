# Claude presents and decides design

Claude shows you a graph, walks you through it, and asks you to choose. Your choice is saved in the note as a decision.
Designed on 19 October 2026, against version 0.5.0, at Roger's request. Not built yet.

The requirements are section 49 of
[`requirements/editor-requirements.md`](https://github.com/rogerbucks/thoughtknot/blob/main/requirements/editor-requirements.md),
slice 10, in workstreams Y1 and Y2. They are built in Waves 23 and 24 of
[`requirements/waves.json`](https://github.com/rogerbucks/thoughtknot/blob/main/requirements/waves.json), after the
Obsidian community release (R2). Roger's rule is that what he adds now goes after R2.

## What works today

- You type `/graph <note>` and Claude Code draws the note in a pane.
- `/graph edit <note>` opens the full editor, and Claude's `propose` tool sends changes you accept or reject.
- The standard schema `decision@1` types decisions, and a rejected change is already kept as one.

## What this adds

| Tool | What Claude does | What you do |
|---|---|---|
| `show` | Opens a note, or turns it to the things, path or lens it names | Look |
| `present` | Walks through steps, each picking out things and links with a caption | Step forward and back at your own pace |
| `decide` | Asks a question with two to six options tied to the graph | Pick one, or none, and say why |

- Only you can answer. Claude, a hook or Remote Control can't answer for you.
- Your pick is written to the note as a `decision@1` decision: the question, the options, your choice, who, when and why.
- Every tool goes through the same classification gate as `/graph`.

## Two doors

| Door | Where | Wave |
|---|---|---|
| The Claude Code mod | The pane in the terminal and the desktop app's Code tab | 23 (Y1) |
| An MCP App | Claude's desktop app chat and Claude Code, from a local MCP server | 24 (Y2) |

An MCP App is a tool whose answer is a small page that Claude draws in a sandboxed frame inside the chat. The page can
call the server's tools and tell Claude what you picked. That is the decision loop.

The server runs on your own device,
reads only the folder you name, and makes no network call. Claude on the web, on mobile and in Cowork would need a remote
connector. That waits for a security review, as the Copilot Cowork skill does.

This also answers open question Q-01: graphs reach outside AI tools through MCP.

## Sources

- [MCP Apps announcement](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/), 26 January 2026.
- [Interactive connectors and MCP Apps in Claude](https://claude.com/resources/articles/interactive-tools-in-claude).
- [Claude Code mods guide](https://betterstack.com/community/guides/ai/claude-code-mods/), mods from 1 October 2026.
