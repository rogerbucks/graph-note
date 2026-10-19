#!/usr/bin/env python3
"""Locks a draft graph: writes its schema — every kind and relationship type, worked out from the data — as a block at the end of the note.

Usage:
  python3 zzSupport/_scripts/graph-spec-lock.py "Standards/How to write a graph note.md"           # print the schema it would write; write nothing
  python3 zzSupport/_scripts/graph-spec-lock.py --write "Standards/How to write a graph note.md"   # add it to the note, under "## Schema"

Writes: with --write, one "## Schema" section in the named note — added at the end, or just before a closing "## Drawing"
section so that drawing still sees it — after a backup to ~/zzBackups/notes/; nothing otherwise.

Category: Checks — graph model

WHY (6 Oct 2026): Roger — "The inclusion of the schema should be done once the graph is locked down." A graph with no
schema is a draft (§5): the checker works its kinds and types out from the data. This script is the lock: the prompt
"Lock the graph in this note" runs it. It declares exactly what the data uses, so the graph passes its strict check the
moment it is locked; from then on anything new must be declared. Forward readings are the type's own words
(COUNTS_AGAINST -> counts against), as the draft drawings already showed them; reverse readings are guessed from the verb
and marked for Roger to confirm — a guess is never presented as decided. Names follow the name-is-id rule
(kind_question, link_favours), so the block reads like the data above it. Standard library only.
Later 6 Oct 2026 (Roger: "let drafts declare completeness rules too"): a draft's Cardinality and Coverage nodes (§25)
are declared by the new GraphMeta, unchanged — the conformance suite proves the report is the same after locking.
WHY the library's guess (14 Oct 2026, graph-spec 0.4.3): both readings now come from graph_rules.guess_readings, the guess the
editor's drafts show, so a locked graph reads as its draft did. It replaces this script's own reverse_guess, which turned a type
ending in a preposition into nonsense (PART_OF -> "is part of by"); the library reads it as "is part of" / "contains". Tested in
graph-note (guessed_readings) and by the conformance suite's lock checks.
"""
import os, re, sys, shutil, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gql_profile as gp, graph_rules as gr
from vault_host import HOST
VAULT = os.path.abspath(os.path.join(HERE, '..'))
def schema_block(name, g, by):
    """The schema for draft graph `name`, as a gql block laid out to read (short lines, labelled parts)."""
    kinds, types = gr.drafted(g)
    meta = f"{name}_schema"; today = dt.date.today().isoformat()
    L = [f"// graph: {name} · SOURCE",
         f"// ── The schema: locked {today} from the data above ──",
         "// The reverse readings are guesses — check each one.",
         f"({meta}:GraphMeta {{",
         f"    graph: '{name}', schema: '{name}@1',",
         f"    owner_engine: 'engine:{HOST}', written_by: '{by}'}}),", '',
         "// ── Kinds of thing ──"]
    for k in kinds: L += [f"(kind_{k.lower()}:Meta:ElementType {{", f"    name: '{k}', kind: 'node', origin: 'source'}}),"]
    L += ['', "// ── Relationship types, with their readings both ways ──"]
    for t in types:
        r, rev = gr.guess_readings(t)   # the library's guess, as the editor's draft drawings show it (14 Oct 2026)
        L += [f"(link_{t.lower()}:Meta:ElementType {{",
              f"    name: '{t}', kind: 'edge', origin: 'source',",
              f"    reading: '{r}', reverse_name: '{rev}'}}),"]
    L += ['', "// ── The graph declares each one ──"]
    L += [f"({meta})-[:DECLARES]->(kind_{k.lower()})," for k in kinds] + [f"({meta})-[:DECLARES]->(link_{t.lower()})," for t in types]
    rules = sorted(g.labelled('Cardinality')) + sorted(g.labelled('Coverage'))
    if rules:   # §25: a draft may carry completeness rules; locking carries them into the schema unchanged
        L += ['', "// ── Its completeness rules (§25), carried from the draft unchanged ──"] + [f"({meta})-[:DECLARES]->({r})," for r in rules]
    L[-1] = L[-1].rstrip(',')
    return '\n'.join(L)

def lock(rel, by):
    """The schema blocks for every draft graph in the note, and the graphs already locked."""
    path = rel if os.path.isabs(rel) else os.path.join(VAULT, rel)
    text = open(path, encoding='utf-8').read(); store = gp.Store()
    for b in re.findall(r"```gql\n(.*?)\n```", text, re.S):
        try:
            g, kind = gp.header(b)
            if kind == 'data': store.apply(b)
        except gp.ProfileError as e: raise SystemExit(f"cannot lock: a block does not read — {e}")
    w = gr.World.from_store(store)
    drafts = [g for g in sorted(w.graphs) if gr.is_draft(w, g) and w[g].nodes]
    return path, text, [schema_block(g, w[g], by) for g in drafts], sorted(set(w.graphs) - set(drafts))

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args: print(__doc__.split('Writes:')[0]); return 2
    by = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--by=')), f"ea/sara@{HOST}")
    path, text, blocks, locked = lock(args[0], by)
    if not blocks: print("nothing to lock — " + (f"already locked: {', '.join(locked)}" if locked else "no graph in this note")); return 0
    section = "## Schema\n\n*Written by `zzSupport/_scripts/graph-spec-lock.py` when the graph was locked. From here on, every new kind or relationship type is declared here first.*\n\n" + '\n\n'.join(f"```gql\n{b}\n```" for b in blocks) + '\n'
    if '--write' not in sys.argv: print(section); return 0
    m = re.search(r"\n## Drawing\n\n<!-- graph-drawing:start.*?<!-- graph-drawing:end -->\s*\Z", text, re.S)
    new = text[:m.start()].rstrip() + "\n\n" + section + text[m.start():] if m else text.rstrip() + "\n\n" + section
    bdir = os.path.expanduser('~/zzBackups/notes'); os.makedirs(bdir, exist_ok=True)
    shutil.copy2(path, os.path.join(bdir, f"{os.path.basename(path)}.{dt.datetime.now():%Y%m%d-%H%M%S}"))
    open(path, 'w', encoding='utf-8').write(new)
    print(f"locked {os.path.relpath(path, VAULT)} — {len(blocks)} schema block(s) written; check the reverse readings"); return 0

if __name__ == '__main__': sys.exit(main())
