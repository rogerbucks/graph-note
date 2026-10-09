"""Canonical JSON (RFC 8785, for the value types the profile allows) and the hashes built on
it."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from typing import Any


UTC = dt.timezone.utc


# ── canonical JSON and the hashes built on it ─────────────────────────────────────────────────
# (RFC 8785, for the value types the profile allows)
def _num(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if v != v or v in (float("inf"), float("-inf")):
        raise ValueError("RFC 8785 has no NaN or infinity")
    if v == int(v) and abs(v) < 1e21:
        return str(int(v))
    r = repr(v)
    if "e" in r:
        m, e = r.split("e")
        e = int(e)
        return f"{m}e{'+' if e > 0 else '-'}{abs(e)}"
    return r


def jcs(v: object) -> str:
    """A value as RFC 8785 canonical JSON — None, a boolean, number, string, list, tuple or dict —
    the same text in every language. Raises TypeError for any other value."""
    if v is None:
        return "null"
    if isinstance(v, (bool, int, float)):
        return _num(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(jcs(x) for x in v) + "]"
    if isinstance(v, dict):
        return (
            "{"
            + ",".join(
                json.dumps(k, ensure_ascii=False) + ":" + jcs(v[k])
                for k in sorted(v, key=lambda k: k.encode("utf-16-be"))
            )
            + "}"
        )
    raise TypeError(f"no canonical JSON for {type(v).__name__}")


def norm(v: Any) -> Any:
    """A value as canonical JSON holds it: an instant as its UTC time in ISO 8601, as Grafeo
    returns it, and a date in ISO 8601; anything else unchanged."""
    if isinstance(v, dt.datetime):
        return (
            v.astimezone(UTC).replace(tzinfo=None) if v.tzinfo else v
        ).isoformat()  # an instant as its UTC time, as Grafeo returns it
    if isinstance(v, dt.date):
        return v.isoformat()
    return v


def hash16(obj: object) -> str:
    """The first 16 hex digits of the SHA-256 of a value's canonical JSON."""
    return hashlib.sha256(jcs(obj).encode()).hexdigest()[:16]


def basis_hash(props: dict[str, Any], reads: str) -> str:
    """rule:basis-hash@1 — hash16 of only the properties a judgement read, named in reads, comma-
    separated."""
    return hash16({k: norm(props.get(k)) for k in (x.strip() for x in reads.split(","))})
