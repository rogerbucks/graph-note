# Named hashes

A hash proves that something has not changed. A bare string of digits does not say how it was made, so a reader cannot
check it. So every hash the graph spec writes names its algorithm (editor spec §51, spec_hashes_named).

## How a hash is written

A hash is the algorithm's name, a colon, then the digits in lower-case hexadecimal. The names come from the IANA
registry of named-information hash algorithms, the one RFC 6920 uses.

| Name | Digits | What it is |
|---|---|---|
| `sha-256` | 64 | the whole SHA-256 |
| `sha-256-64` | 16 | the first 64 bits of SHA-256 |

So a basis hash reads `hash: 'sha-256-64:aaae1ecfc82d02ce'`, and a change set's header reads
`against sha-256-64:05d75fdcbdb1d37b`. An `ni:` id, such as `ni:///sha-256;f4Ox…`, names its algorithm already.

## What is refused

The check refuses a hash that names no algorithm, such as `hash: 'aaae1ecfc82d02ce'`. It also refuses a name it does
not know, and digits of the wrong length for the name. The fix says how to write it.

These are the hashes the graph spec writes:

- `hash` on a pin (`RESTS_ON`) and on a serving's `SERVED` link;
- `content_hash` on a judgement (`Decision`) and on a `Serving`;
- the state a change set was made `against`, in its header.

## Records that cannot be changed unseen

- **A judgement** keeps a `content_hash` over its text and its pins (rule:judgement-hash@1). §23 rule 7 reports a
  judgement whose hash no longer matches.
- **A serving** keeps a `content_hash` over what it records and every item it served (rule:serving-hash@1). The view
  server writes it. §24 H3 rule 5 reports a serving whose hash no longer matches.
- **An issued document** is named by the `ni:` id of its bytes (RFC 6920). A change to its bytes changes its name.

## Where it is held

`packages/graph-spec/test/hashes.test.mjs` and `python/graph_spec/tests/test_hashes_named.py` hold both libraries to
these rules.
