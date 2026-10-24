"""Where a direct link's words go (editor spec §25, untangle_direct), for direct_links.py: each
link's words take the spot along its curve that covers the least, best over no box, no words
placed already and no other line. It is the core's direct-words.ts, step for step."""

from __future__ import annotations

from typing import Any

# How far a link's words sit off its middle, as a share of their size, so they keep off the line.
WORDS_OFF = 0.55


def _js_length(text: str) -> int:
    """How long `text` is as JavaScript counts it, in UTF-16 units."""
    return len(text.encode("utf-16-le")) // 2


def word_spots(marks, boxes, curves) -> dict[str, tuple[float, float]]:
    """Where each link's words go, by the id of each of its labels. A link's labels move as one
    block, its rows kept as Graphviz set them. The block sits at the middle of the curve if it
    covers no box, no earlier words and no other line; else at the first clear spot along it,
    either side, a little further off if need be; with none clear, where it covers least."""
    taken = [(b.x - b.hw, b.y - b.hh, b.x + b.hw, b.y + b.hh) for b in boxes.values()]
    spots: dict[str, tuple[float, float]] = {}
    # points along every line, so words can keep off the lines they do not name
    lines = [
        (of, [c.at(t) for t in (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)])
        for of, c in curves.items()
    ]
    words: dict[str, list[dict[str, Any]]] = {}
    for m in marks:
        of = m.get("of")
        if m["kind"] == "label" and of is not None and of not in boxes and of in curves:
            words.setdefault(of, []).append(m)
    for of, rows in words.items():
        c = curves[of]
        # the block's middle, and each row's room from it
        sx = sy = 0.0
        for m in rows:
            sx += m["x"]
            sy += m["y"]
        mx, my = sx / len(rows), sy / len(rows)
        size = max(m["size"] for m in rows)
        room = []
        for m in rows:
            wide = m.get("maxWidth")
            half = (_js_length(m["text"]) * m["size"] * 0.5 if wide is None else wide) / 2 + 2
            room.append(
                (
                    m["x"] - mx - half,
                    m["y"] - my - m["size"] * 0.84,
                    m["x"] - mx + half,
                    m["y"] - my + m["size"] * 0.24,
                )
            )
        tall = max(r[3] for r in room) - min(r[1] for r in room)

        def placed(p, room=room):
            return [(p[0] + r[0], p[1] + r[1], p[0] + r[2], p[1] + r[3]) for r in room]

        # how much the block at `p` covers: the area of boxes and words under it, and a share for
        # each line crossed
        def cover(p, of=of, size=size, placed=placed) -> float:
            n = 0.0
            for r in placed(p):
                for o in taken:
                    n += max(0, min(r[2], o[2]) - max(r[0], o[0])) * max(
                        0, min(r[3], o[3]) - max(r[1], o[1])
                    )
                for line_of, points in lines:
                    if line_of != of:
                        for x, y in points:
                            if r[0] < x < r[2] and r[1] < y < r[3]:
                                n += size * size * 0.36
            return n

        # off the line by half the block's height: one row sits as far off as WORDS_OFF says
        off = max(size * WORDS_OFF, tall / 2)
        best, least = c.words_at(0.5, off), float("inf")
        clear = False
        for far in (off, off * 2.2):
            for t in (0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75):
                for side in (1, -1):
                    p = c.words_at(t, side * far)
                    n = cover(p)
                    if n < least:
                        best, least = p, n
                    if not n:
                        clear = True
                        break
                if clear:
                    break
            if clear:
                break
        for m in rows:
            spots[m["id"]] = (best[0] + m["x"] - mx, best[1] + m["y"] - my)
        taken.extend(placed(best))
    return spots
