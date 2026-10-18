# D-02 Overdue parked thing

**You should see:** the Small reader, parked with a revisit_by day long past, marked "⏳ overdue". The badge adds "1 overdue", and the list behind the badge names the box and what is needed. VoiceOver reads the box as "parked for later, overdue".

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader'}),
(later_small:Deferred {what: 'say what the small reader answers', why: 'waiting for the trial', revisit_by: DATE '2026-01-15'}),
(small)-[:ANSWERS]->(question),
(later_small)-[:DEFERS]->(small)
```

<!-- expect: clean -->
<!-- expect: parked 1 -->
<!-- expect: overdue 1 -->
<!-- expect: hint "the thing later_small has no text" -->

An ℹ hint on `later_small`, "the thing later_small has no text", is expected here: it is only offered, it is not counted as a problem, and the badge ignores it.

**Do this:**

1. Look at the Small reader box: dashed, marked "⏳ overdue".
2. Read the badge: it should say 1 parked and 1 overdue.
3. Open the list behind the badge and check it names the box and "say what the small reader answers".
4. With VoiceOver on, focus the box and listen: "parked for later, overdue".
5. Change the revisit_by day to one in the future: the mark should say "⏳ later" and the overdue count go.

**Checklist line:**

> **D-02** Change its revisit_by to a day in the past. The mark says "⏳ overdue", and the badge adds "1 overdue". The list behind the badge names it with what is needed. VoiceOver reads the box as "parked for later, overdue".

**Back to the checklist:** [D-02 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for D-02 in its list.
