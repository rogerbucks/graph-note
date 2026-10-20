# The guard language

A guard says when a step in a process may happen, such as `score > 600 and balance = 0`. A note can be shared with
anyone, so a guard is read as data and never run as code (editor spec §51, spec_guard_language).

## What a guard may hold

- **Names** of values the process gives it, such as `score`. A name it is not given is unknown, and the check says so.
- **Values:** numbers such as `600` or `-1.5`, text in single or double quotes, and `True` or `False`.
- **Comparisons:** `=`, `==`, `!=`, `<`, `>`, `<=` and `>=`.
- **Joining words:** `and`, `or` and `not`, and round brackets to group them.
- **SCXML's marks**, read as the words above: `&&` is `and`, `||` is `or`, `!` is `not`, `===` is `==`, `!==` is `!=`.

## What a guard may never hold

Anything else is refused, with the reason:

- a call, such as `now()` or `open('file')`;
- a dot, an index or a list, such as `score.x` or `score[0]`;
- sums, such as `score + 1`;
- a second statement, such as `score > 1; print(1)`;
- a backslash inside text.

So a guard cannot read a file, write anything, reach the network or read the clock.

## Its limits

A guard holds at most 1,000 characters, and its brackets and `not` go at most 64 deep. A longer or deeper one is
refused before it is read further.

## The grammar

The grammar below is in the EBNF form of ISO/IEC 14977. Spaces may come between any two tokens.

```ebnf
guard      = either ;
either     = both , { "or" , both } ;
both       = compare , { "and" , compare } ;
compare    = atom , { comparison , atom } ;
atom       = "(" , either , ")" | "not" , compare | value | name ;
comparison = "=" | "==" | "!=" | "<" | ">" | "<=" | ">=" | "===" | "!==" ;
value      = number | text | "True" | "False" | "true" | "false" ;
number     = [ "-" ] , digit , { digit } , [ "." , digit , { digit } ] ;
text       = "'" , { character - ( "'" | "\" ) } , "'" | '"' , { character - ( '"' | "\" ) } , '"' ;
name       = letter , { letter | digit } ;
```

A `letter` is A to Z, a to z or `_`. `&&`, `||` and `!` stand for `and`, `or` and `not`.

## Where it is held

- `packages/graph-spec/test/guard-cases.json` holds the cases: each guard, and whether it holds, is refused or is
  unknown.
- `python/graph_spec/tests/test_guard_language.py` and `packages/graph-spec/test/guards.test.mjs` hold both libraries
  to them.
