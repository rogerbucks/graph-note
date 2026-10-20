"""The secrets a reader refuses to serve, each found by its shape (editor spec §51,
spec_secrets_and_fences). The JavaScript library finds them with the same shapes
(packages/graph-spec/src/reader/secrets.js), and test/secret-cases.json holds both to the same
answers."""

from __future__ import annotations

import re


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d = d * 2 - 9 if d * 2 > 9 else d * 2
        total += d
    return total % 10 == 0


# A secret's name, ending the name a value is given under, in snake_case or camelCase. A bare
# `key` is an ordinary word, so only a name ending in _key or Key is a secret's.
_SECRET_NAMES = [
    re.compile(
        r"(?:^|[^A-Za-z0-9])(?:pass(?:word|wd|phrase|code)?|pwd|pin|secret|token|credentials?)"
        r"(?![A-Za-z0-9])",
        re.I,
    ),
    re.compile(r"_key(?![A-Za-z0-9])", re.I),
    re.compile(
        r"[a-z0-9](?:Pass(?:word|wd|phrase|code)?|Pwd|Pin|Secret|Token|Key|Credentials?)"
        r"(?![A-Za-z0-9])"
    ),
]
# then a text of four characters or more, given to it with a colon or an equals sign
_SECRET_VALUE = r"[\"']?\s*[:=]\s*[\"'][^\"'\s]{4,}"
_NAMED = [re.compile(n.pattern + _SECRET_VALUE, n.flags) for n in _SECRET_NAMES]
_API = [
    r"\bsk-[A-Za-z0-9_-]{16,}",
    r"\bAIza[0-9A-Za-z_-]{30,}",
    r"\bgh[pousr]_[A-Za-z0-9]{30,}",
    r"\bgithub_pat_\w{20,}",
    r"\bxox[abeprs]-[A-Za-z0-9-]{10,}",
]
_CARD = re.compile(r"(?:^|[^\w.-])([2-6](?:[ -]?\d){12,18})(?![\w.-])", re.A)
_SHAPES = [
    ("a private key", lambda line: re.search(r"-----BEGIN [A-Z ]*PRIVATE KEY", line)),
    ("an access key", lambda line: re.search(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b", line, re.A)),
    ("an API key", lambda line: any(re.search(p, line, re.A) for p in _API)),
    ("a token", lambda line: re.search(r"\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}", line, re.A)),
    ("a password or secret", lambda line: any(n.search(line) for n in _NAMED)),
    (
        "a card number",
        lambda line: any(_luhn(re.sub(r"[ -]", "", m.group(1))) for m in _CARD.finditer(line)),
    ),
]


def secrets_in(text: str) -> list[str]:
    """The kinds of secret a text holds, each once and in words, never the text that matched."""
    found: list[str] = []
    for line in str(text).split("\n"):
        for what, test in _SHAPES:
            if what not in found and test(line):
                found.append(what)
    return found
