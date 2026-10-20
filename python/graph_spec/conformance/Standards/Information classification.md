---
status: active
tags: [test, graph-model]
---

# Information classification

**Made-up test data.** The view server's case reads its classes and its destination matrix from this note (spec §24 H3). It stands in for the owner's real classification note, which stays private. The library finds the two tables below by their shape, so keep that shape.

## The classes, highest risk first

| Rank | Class | What it is |
|---|---|---|
| 1 | **Unmoderated** | Not yet checked, so treated as the worst it could be |
| 2 | **Eyes-only** | Only its owner opens it, by hand |
| 3 | **Credential** | A password, key or token |
| 4 | **Personal** | About a person |
| 5 | **Third-party** | Another organisation's, held under an obligation |
| 6 | **Own** | The owner's own work, not yet public |
| 7 | **Public** | Already published |

## The destination matrix

**The highest class each destination may receive.** Read down the column.

| | Unmoderated | Eyes-only | Credential | Personal | Third-party | Own | Public |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Claude — conversation** | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ |
| **Local model** | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ |

✅ allowed · ⚠️ allowed only when its conditions are met · ❌ never
