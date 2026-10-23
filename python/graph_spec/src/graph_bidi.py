"""A person's own words in a drawing keep their own direction (editor spec §42, bidi_labels). A
label with a right-to-left letter, such as Arabic or Hebrew, is set apart from what is around it.
It is read from its first strong letter: Unicode's first strong isolate (U+2068) to the pop
directional isolate (U+2069). A label with none stays byte for byte as it was. The same as
packages/core/src/bidi.ts.
"""

import re

# A letter of a right-to-left block: Hebrew to Arabic Extended-A, their presentation forms, and
# the astral ones. The same blocks as packages/core/src/bidi.ts.
_RTL = re.compile(
    "[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff\U00010800-\U00010fff\U0001e800-\U0001efff]"
)


def isolated(text: str) -> str:
    """The words of a label, escaped for SVG, set apart and read from their first strong letter
    when they hold a right-to-left letter (editor spec §42, bidi_labels). Words set apart stay as
    they are."""
    if _RTL.search(text) and not text.startswith("&#x2068;"):
        return f"&#x2068;{text}&#x2069;"
    return text


def isolate_labels(svg: str) -> str:
    """Every text and text span of the SVG with a right-to-left letter, isolated."""
    return re.sub(
        r"(<(?:text|tspan)\b[^>]*>)([^<]+)(?=</(?:text|tspan)>)",
        lambda m: m.group(1) + isolated(m.group(2)),
        svg,
    )
