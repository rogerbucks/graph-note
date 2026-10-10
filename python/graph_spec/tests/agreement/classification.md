# A classification note for the agreement tests

Generic test data in the shape a host's classification note has: the destination matrix, and the
classes ranked highest risk first. It names no real model, person or machine.

| | Unmoderated | Public | Internal | Confidential |
|---|---|---|---|---|
| **Claude — conversation** | ❌ | ✅ | ⚠️ | ❌ |
| **Local model** | ✅ | ✅ | ✅ | ⚠️ |

| Rank | Class |
|---|---|
| 1 | **Confidential** |
| 2 | **Internal** |
| 3 | **Unmoderated** |
| 4 | **Public** |
