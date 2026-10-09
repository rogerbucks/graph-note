"""Names suggested for things written without one (editor spec §4): a name from a text, in the
style of the names already in the graph and never one of them — the core's name-suggestions.ts,
function for function, so every reader draws such a thing under the same name (10 Oct 2026).

Only the core suggests texts from names: a thing with no text is drawn by its name, so drawing
needs nothing from that half. name_cases.json, in tests/, holds both languages to one table.

JavaScript's regular expressions are mirrored exactly: its \\d and \\w are ASCII, its $ (with no
m flag) is the end of the text, and its . stops at any line break."""

from __future__ import annotations

import math
import re
import unicodedata
from collections.abc import Iterable, Mapping

DEFAULT_WORDS = 3
LONGEST = 32
# the words the graph reader keeps, then others of GQL that a later engine might: none is ever
# suggested as a name
RESERVED = frozenset(
    "insert match set date datetime true false null where return graph id create delete detach "
    "merge remove optional as from order by limit offset skip filter let for yield call select "
    "and or not xor in is exists node edge union case when then else end use asc desc distinct "
    "group having unknown".split()
)
SMALL_WORDS = frozenset(
    ["a", "an", "the", "of", "to", "be", "or", "and", "for", "in", "on", "at", "by", "with", "is"]
)

_CASINGS = (
    ("snake", re.compile(r"[a-z0-9]+(_[a-z0-9]+)+")),
    ("camel", re.compile(r"[a-z][a-z0-9]*([A-Z][a-z0-9]*)+")),
    ("pascal", re.compile(r"([A-Z][a-z0-9]+){2,}")),
)

GraphNames = Iterable[str] | Mapping[str, str]


def _entries_of(names: GraphNames) -> list[tuple[str, str | None]]:
    """Each name with its kind, or with None when the names come without kinds."""
    if isinstance(names, Mapping):
        return list(names.items())
    return [(n, None) for n in names]


def _number_off(name: str, underscore: str) -> str:
    """A name without a trailing uniqueness number (and its _, when underscore is '_?' or '_')."""
    return re.sub(underscore + r"[0-9]+\Z", "", name, count=1)


def _words_of_name(name: str) -> list[str]:
    """The words of a name written in any casing, lowercased, without a trailing number."""
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", _number_off(name, "_"))
    return [w.lower() for w in re.split(r"[^A-Za-z0-9]+", spaced) if w]


def _starts_with_kind(name: str, kind: str) -> str | None:
    """Whether a name starts with its kind in full ('kind'), or its first letter ('initial'),
    then a separator or a capital."""
    k = re.sub(r"[^a-z0-9]", "", kind.lower())
    if not k:
        return None

    def boundary(at: int) -> bool:
        return at < len(name) and (name[at] == "_" or "A" <= name[at] <= "Z")

    if len(name) > len(k) and name[: len(k)].lower() == k and boundary(len(k)):
        return "kind"
    if len(name) > 1 and name[0].lower() == k[0] and boundary(1):
        return "initial"
    return None


def _casing_of(name: str) -> str | None:
    stripped = _number_off(name, "_?")
    return next((c for c, rx in _CASINGS if rx.fullmatch(stripped)), None)


def name_style_of(names: GraphNames) -> dict[str, str | int]:
    """The style the names of a graph are written in, as {casing, words, prefix}: the casing most
    of them show (a name of one word shows none, so does not vote), the words they usually have,
    and a prefix from the kind where most names with a kind show one."""
    entries = _entries_of(names)
    votes: dict[str, int] = {}
    for name, _ in entries:
        casing = _casing_of(name)
        if casing:
            votes[casing] = votes.get(casing, 0) + 1
    casing = _CASINGS[0][0]
    for c, _ in _CASINGS:
        if votes.get(c, 0) > votes.get(casing, 0):
            casing = c
    # what each name with a kind shows of it, by its place among the entries
    found = [_starts_with_kind(n, k) if k else None for n, k in entries]
    kinded = sum(1 for _, k in entries if k)

    def count(p: str) -> int:
        return sum(1 for (_, k), f in zip(entries, found) if k and f == p)

    prefix = "none"
    for p in ("kind", "initial"):
        if kinded >= 2 and count(p) >= 2 and count(p) >= kinded * 0.6:
            prefix = p
            break
    rx = dict(_CASINGS)[casing]
    counts = [
        len(_words_of_name(name)) - (1 if prefix != "none" and k and found[i] == prefix else 0)
        for i, (name, k) in enumerate(entries)
        if rx.fullmatch(_number_off(name, "_?"))
    ]
    words = min(4, max(1, math.ceil(sum(counts) / len(counts) - 0.5))) if counts else DEFAULT_WORDS
    return {"casing": casing, "words": words, "prefix": prefix}


def name_words(text: str) -> list[str]:
    """The words of a text, lowercased and plain ASCII: accents taken off their letters,
    apostrophes and hyphens closed up, other marks parting words. The reader takes only A–Z, a–z,
    digits and _ in a name, so a word in another script is left out, whole."""
    plain = re.sub("[̀-ͯ]", "", unicodedata.normalize("NFD", text)).lower()
    # parting at white space first, as the core does, changes nothing: white space parts words
    return [w for w in re.split(r"[^a-z0-9]+", re.sub("['’-]", "", plain)) if w]


def _kind_word(kind: str | None) -> str:
    """A kind as one lowercase ASCII word, or '' when it has none."""
    return re.sub(r"[^a-z0-9]", "", (kind or "").lower())


def _joined(words: list[str], casing: str) -> str:
    """Words written as one name in a casing."""
    if casing == "snake":
        return "_".join(words)
    return "".join(
        w if i == 0 and casing == "camel" else w[:1].upper() + w[1:] for i, w in enumerate(words)
    )


def name_from_text(text: str, names: GraphNames, kind: str | None = None) -> str:
    """A name for a thing given text but no name, from the first few words of the text, in the
    style of the names already in the graph (its casing, its length, a prefix from the kind when
    kind is given and the names have one), and never a name the graph already has — compared
    without regard to case; a number is added, in the same style, until it is not. Never a word
    the language keeps for itself, which is numbered in the same way. Always a name the reader
    can read."""
    if not isinstance(names, Mapping):
        names = list(names)
    style = name_style_of(names)
    taken = {n.lower() for n, _ in _entries_of(names)}
    words = name_words(text)
    significant = [w for w in words if w not in SMALL_WORDS]
    if significant:
        words = significant
    k = _kind_word(kind)
    if not words:
        words = [k or "thing"]
    lead = k if style["prefix"] == "kind" and k else k[:1] if style["prefix"] == "initial" else ""
    if not lead and re.match(r"[0-9]", words[0]):
        words = ["item", *words]
    words = words[: int(style["words"])]

    def compose(ws: list[str]) -> str:
        return _joined([lead, *ws] if lead else ws, str(style["casing"]))

    while len(words) > 1 and len(compose(words)) > LONGEST:
        words.pop()
    base = compose(words)[:LONGEST]
    name, n = base, 2
    while name.lower() in taken or name.lower() in RESERVED:
        name = f"{base}_{n}" if style["casing"] == "snake" else f"{base}{n}"
        n += 1
    return name
