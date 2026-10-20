"""§13 a guard read as data, never run as code: comparisons joined by and, or and not.

A guard comes from a note, which anyone may share. So it is parsed here, as the JavaScript checker
parses it (packages/graph-spec/src/joins/validate.js), and anything else is refused. A guard may
hold names from the context, numbers, quoted text, True and False, brackets, the comparisons
= == != < > <= >=, and and, or and not. SCXML's && || ! === and !== are read as those.
"""

from __future__ import annotations

import re
from typing import Any

_TOKEN = re.compile(
    r"\s*(?:(===|!==|==|!=|>=|<=|&&|\|\||[=<>()!])"
    r"|([A-Za-z_]\w*)"
    r"|(-?\d+(?:\.\d+)?)"
    r"|'([^'\\]*)'|\"([^\"\\]*)\")"
)
_SAME = {"===": "==", "!==": "!=", "&&": "and", "||": "or", "!": "not", "=": "=="}
_COMPARE = {
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    "<": lambda a, b: a < b,
    ">": lambda a, b: a > b,
    "<=": lambda a, b: a <= b,
    ">=": lambda a, b: a >= b,
}
_WORDS = {"and", "or", "not"}
# A guard's most characters, and how deep its brackets and `not` may go (editor spec §51,
# spec_guard_language). The JavaScript checker states the same (src/rules/guards.js).
LIMITS = {"chars": 1000, "nesting": 64}
_TEXT, _NAME = "text", "name"


def _refusal(guard: str, why: str) -> ValueError:
    """The error for a guard that is not comparisons joined by and, or and not."""
    return ValueError(f"refused: the guard {guard!r} {why}; a guard holds comparisons only (§13)")


def _tokens(guard: str) -> list[tuple[str, Any]]:
    """The guard's tokens, each as (kind, value); anything the grammar has no token for is
    refused."""
    out: list[tuple[str, Any]] = []
    pos = 0
    while pos < len(guard):
        if not guard[pos:].strip():
            break
        m = _TOKEN.match(guard, pos)
        if not m or m.end() == pos:
            raise _refusal(guard, f"holds {guard[pos:].strip()[:20]!r}")
        op, name, number, single, double = m.groups()
        if op is not None:
            out.append(("op", _SAME.get(op, op)))
        elif name is not None:
            out.append(("op", name) if name in _WORDS else (_NAME, name))
        elif number is not None:
            out.append((_TEXT, float(number) if "." in number else int(number)))
        else:
            out.append((_TEXT, single if single is not None else double))
        pos = m.end()
    return out


def holds(guard: str, ctx: dict[str, Any]) -> bool:
    """Whether a guard holds in a context. A name the context lacks raises NameError, as Python
    did; anything that is not comparisons joined by and, or and not raises ValueError."""
    if len(guard) > LIMITS["chars"]:
        raise _refusal(guard[:20] + "…", f"is longer than {LIMITS['chars']} characters")
    toks = _tokens(guard)
    for (kind, v), after in zip(toks, toks[1:]):
        if after == ("op", "(") and (kind != "op" or v == ")"):
            raise _refusal(guard, f"calls {v!r}")
    i = depth = 0

    def peek() -> tuple[str, Any] | None:
        return toks[i] if i < len(toks) else None

    def take() -> tuple[str, Any]:
        nonlocal i
        if i >= len(toks):
            raise _refusal(guard, "ends too soon")
        i += 1
        return toks[i - 1]

    def deeper(within: Any) -> Any:
        """A bracket or `not` read inside, refused past the nesting limit."""
        nonlocal depth
        depth += 1
        if depth > LIMITS["nesting"]:
            raise _refusal(guard[:20] + "…", f"goes more than {LIMITS['nesting']} deep")
        try:
            return within()
        finally:
            depth -= 1

    def bracketed() -> Any:
        out = either()
        if take() != ("op", ")"):
            raise _refusal(guard, "has a bracket left open")
        return out

    def atom() -> Any:
        kind, v = take()
        if (kind, v) == ("op", "("):
            return deeper(bracketed)
        if (kind, v) == ("op", "not"):
            return deeper(lambda: not compare())
        if kind == _TEXT:
            return v
        if kind == _NAME:
            if v in ("True", "true"):
                return True
            if v in ("False", "false"):
                return False
            if v not in ctx:
                raise NameError(f"name '{v}' is not defined")
            return ctx[v]
        raise _refusal(guard, f"has {v!r} where a value goes")

    def compare() -> Any:
        a = atom()
        while (t := peek()) and t[0] == "op" and t[1] in _COMPARE:
            take()
            a = _COMPARE[t[1]](a, atom())
        return a

    def both() -> Any:
        a = compare()
        while peek() == ("op", "and"):
            take()
            b = compare()
            a = b if a else a
        return a

    def either() -> Any:
        a = both()
        while peek() == ("op", "or"):
            take()
            b = both()
            a = a if a else b
        return a

    out = either()
    if i != len(toks):
        raise _refusal(guard, f"has {toks[i][1]!r} after its end")
    return bool(out)
