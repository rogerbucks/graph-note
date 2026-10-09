"""§20 the likelihood scale and the arithmetic on its ranges — combining, negating, Wilson
intervals, verdicts and corroboration."""

from __future__ import annotations

import math
from collections.abc import Sequence


# ── §20: certainty — likelihood scale, ranges, caches, calibration, reliability, corroboration ───
LIKELIHOOD = [
    "almost-no-chance",
    "very-unlikely",
    "unlikely",
    "even-chance",
    "likely",
    "very-likely",
    "almost-certain",
]  # ICD 203, in order
CONFIDENCE = ["low", "moderate", "high"]
_BANDS = [
    ("almost-no-chance", 0, 5),
    ("very-unlikely", 5, 20),
    ("unlikely", 20, 45),
    ("even-chance", 45, 55),
    ("likely", 55, 80),
    ("very-likely", 80, 95),
    ("almost-certain", 95, 100),
]  # end bands stretched to 0 and 100 for naming only
RANGE = {t: (lo, hi) for t, lo, hi in _BANDS} | {
    "almost-no-chance": (1, 5),
    "almost-certain": (95, 99),
    "cannot-judge": (0, 100),
}


def _word_lo(x):
    return next(t for t, lo, hi in _BANDS if lo <= x < hi or (x == 100 and hi == 100))


def _word_hi(x):
    return next(t for t, lo, hi in _BANDS if lo < x <= hi or (x == 0 and lo == 0))


def words(iv: tuple[float, float]) -> str:
    """The likelihood words a range covers — 'likely', or 'almost-no-chance to even-chance'."""
    lo, hi = iv
    if lo <= 1 and hi >= 99:
        return "cannot judge"
    a, b = _word_lo(lo), _word_hi(hi)
    return a if a == b else f"{a} to {b}"


def both(
    a: tuple[float, float], b: tuple[float, float], dep: str = "unknown"
) -> tuple[float, float]:
    """rule:combine@1 — both true. Dependence unknown: the Fréchet bounds; independent: the
    product."""
    return (
        (a[0] * b[0] / 100, a[1] * b[1] / 100)
        if dep == "independent"
        else (max(0, a[0] + b[0] - 100), min(a[1], b[1]))
    )


def either(
    a: tuple[float, float], b: tuple[float, float], dep: str = "unknown"
) -> tuple[float, float]:
    """rule:combine@1 — either true. Dependence unknown: the Fréchet bounds; independent: one less
    the chance that neither is."""
    return (
        ((100 - (100 - a[0]) * (100 - b[0]) / 100), (100 - (100 - a[1]) * (100 - b[1]) / 100))
        if dep == "independent"
        else (max(a[0], b[0]), min(100, a[1] + b[1]))
    )


def negate(a: tuple[float, float]) -> tuple[float, float]:
    """The range of a claim's being false, from the range of its being true."""
    return (100 - a[1], 100 - a[0])


def outcomes(a: tuple[float, float], b: tuple[float, float]) -> dict[str, tuple[float, float]]:
    """The four joint outcomes of two independent claims, as ranges (each is bilinear, so its
    extremes sit at the corners)."""
    f = {
        "both true": lambda p, q: p * q,
        "only the first": lambda p, q: p * (1 - q),
        "only the second": lambda p, q: (1 - p) * q,
        "neither": lambda p, q: (1 - p) * (1 - q),
        "exactly one": lambda p, q: p + q - 2 * p * q,
    }
    cs = [(p / 100, q / 100) for p in a for q in b]
    return {k: (min(g(*c) for c in cs) * 100, max(g(*c) for c in cs) * 100) for k, g in f.items()}


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson interval for a proportion, in percent, rounded outward to 0.1."""
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (math.floor((c - h) * 1000) / 10, math.ceil((c + h) * 1000) / 10)


def verdict(iv: tuple[float, float], band: tuple[float, float]) -> str:
    """How a track record's range sits against the band its word names: calibrated, over-confident,
    under-confident or cannot judge yet."""
    lo, hi = iv
    blo, bhi = map(float, band)
    if lo >= blo and hi <= bhi:
        return "calibrated"
    if hi < blo:
        return "over-confident"
    if lo > bhi:
        return "under-confident"
    return "cannot judge yet"


def corroborate(ranges: Sequence[tuple[float, float]], base: float = 50.0) -> tuple[float, float]:
    """rule:corroborate@1 — Bayes on odds, from a base rate; ranges taken at their corners."""

    def post(rs):
        b = base / (100 - base)
        o = b
        for r in rs:
            o *= (r / (100 - r)) / b
        return 100 * o / (1 + o)

    return (
        math.floor(post([r[0] for r in ranges]) * 10) / 10,
        math.ceil(post([r[1] for r in ranges]) * 10) / 10,
    )


def span(likelihood: str | None, lt: str | None = None) -> tuple[float, float] | None:
    """A likelihood word's range, or the range from one word to another; None for a word not on the
    scale."""
    return (
        (RANGE[likelihood][0], RANGE[lt or likelihood][1])
        if likelihood in RANGE and (lt or likelihood) in RANGE
        else None
    )  # an undeclared word has no range; §20's scale check reports it


def band_rank(w: str | None) -> int:
    """A likelihood word's place on the scale, lowest first; -1 for anything not on it, so cannot-
    judge ranks below every band (§20)."""
    return (
        LIKELIHOOD.index(w) if w in LIKELIHOOD else -1
    )  # cannot-judge ranks below every band (§20)
