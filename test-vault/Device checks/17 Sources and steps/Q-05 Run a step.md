# Q-05 Run a step

**You should see:** the step's card saying "Step colleagues proposes links into team", that people takes (:Person), (:Project) and [:WORKS_ON], a choice of "graph team" or "view people_only of team", and Run; the note unchanged until Run is pressed. Run with the graph chosen writes a change set under the graph, each new WORKS_WITH link waiting to be accepted or rejected, and the graph block stays as it was. With the view chosen, the card says what it lacks and nothing is written. The second step, written as CALL, says it never calls a named action, with no Run.

**Test diagram:**

```gql
// graph: team
(ada:Person {name: 'Ada'}),
(bob:Person {name: 'Bob'}),
(atlas:Project {name: 'Atlas'}),
(ada)-[:WORKS_ON]->(atlas), (bob)-[:WORKS_ON]->(atlas)
```

```gql
// graph: team · QUERY view people_only
MATCH (n:Person) RETURN n
```

```gql
// graph: team · QUERY step colleagues
// takes people: (:Person), (:Project), [:WORKS_ON]
MATCH (a:Person)-[:WORKS_ON]->(p:Project)<-[:WORKS_ON]-(b:Person)
INSERT (a)-[:WORKS_WITH]->(b)
```

```gql
// graph: team · QUERY step ranked
// takes people: (:Person)
CALL algo.pageRank()
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the blocks.
1. Look at the colleagues card. Check it says what it proposes into and what people takes, and offers "graph team" and "view people_only of team". Check the note has not changed.
2. With "graph team" chosen, press Run. Check a change set block appears under the graph block, its card listing two WORKS_WITH links, each with Accept and Reject, and the graph block is as it was.
3. Choose "view people_only of team" and press Run. Check the card says people takes (:Project) things and [:WORKS_ON] links that the view lacks, and that nothing new is written.
4. Look at the ranked card. Check it says a step never calls a procedure or a named action, and has no Run.
5. Switch to reading view. Check the colleagues card is shown with no Run.
6. Close the note; the test vault reset takes the change set out again.

**Checklist line:**

> **Q-05** A step, in Live Preview: its card says what it proposes into and what its point takes, offers the note's graph and its view, and nothing in the note changes until Run is pressed. Press Run with the graph chosen: a change set appears under the graph, each link waiting to be accepted or rejected, and the graph block is the same. Choose the view of people only and press Run: the card says which kind and which type it lacks, and nothing is written. The step written as CALL says it never calls a named action, and has no Run. In reading view no Run is offered.

**Back to the checklist:** [Q-05 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Q-05 in its list.
