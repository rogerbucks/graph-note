# E-06 Large graph way in

**You should see:** under the drawing's bar, a note saying "This graph has 51 things, too many to read in one drawing: open it as a table, or make a view of the part you need. A view is made with Edit here, then Make a view.", with a Show as table button beside it. The graph is still drawn, as nothing changes until you choose. Pressing Show as table writes the table type into a new style block below the graph, and the card shows a table of the 51 things, with no such note any more.

**Test diagram:**

```gql
// graph: many · SOURCE
(t01:Thing {name: 'Thing 01'}),
(t02:Thing {name: 'Thing 02'}),
(t03:Thing {name: 'Thing 03'}),
(t04:Thing {name: 'Thing 04'}),
(t05:Thing {name: 'Thing 05'}),
(t06:Thing {name: 'Thing 06'}),
(t07:Thing {name: 'Thing 07'}),
(t08:Thing {name: 'Thing 08'}),
(t09:Thing {name: 'Thing 09'}),
(t10:Thing {name: 'Thing 10'}),
(t11:Thing {name: 'Thing 11'}),
(t12:Thing {name: 'Thing 12'}),
(t13:Thing {name: 'Thing 13'}),
(t14:Thing {name: 'Thing 14'}),
(t15:Thing {name: 'Thing 15'}),
(t16:Thing {name: 'Thing 16'}),
(t17:Thing {name: 'Thing 17'}),
(t18:Thing {name: 'Thing 18'}),
(t19:Thing {name: 'Thing 19'}),
(t20:Thing {name: 'Thing 20'}),
(t21:Thing {name: 'Thing 21'}),
(t22:Thing {name: 'Thing 22'}),
(t23:Thing {name: 'Thing 23'}),
(t24:Thing {name: 'Thing 24'}),
(t25:Thing {name: 'Thing 25'}),
(t26:Thing {name: 'Thing 26'}),
(t27:Thing {name: 'Thing 27'}),
(t28:Thing {name: 'Thing 28'}),
(t29:Thing {name: 'Thing 29'}),
(t30:Thing {name: 'Thing 30'}),
(t31:Thing {name: 'Thing 31'}),
(t32:Thing {name: 'Thing 32'}),
(t33:Thing {name: 'Thing 33'}),
(t34:Thing {name: 'Thing 34'}),
(t35:Thing {name: 'Thing 35'}),
(t36:Thing {name: 'Thing 36'}),
(t37:Thing {name: 'Thing 37'}),
(t38:Thing {name: 'Thing 38'}),
(t39:Thing {name: 'Thing 39'}),
(t40:Thing {name: 'Thing 40'}),
(t41:Thing {name: 'Thing 41'}),
(t42:Thing {name: 'Thing 42'}),
(t43:Thing {name: 'Thing 43'}),
(t44:Thing {name: 'Thing 44'}),
(t45:Thing {name: 'Thing 45'}),
(t46:Thing {name: 'Thing 46'}),
(t47:Thing {name: 'Thing 47'}),
(t48:Thing {name: 'Thing 48'}),
(t49:Thing {name: 'Thing 49'}),
(t50:Thing {name: 'Thing 50'}),
(t51:Thing {name: 'Thing 51'}),
(t01)-[:NEXT]->(t02),
(t02)-[:NEXT]->(t03),
(t03)-[:NEXT]->(t04)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the block: Show as table writes into the note.
1. Read the note under the bar, and see the graph still drawn.
2. Press Show as table: a style block appears below the graph, and the card shows the table.
3. Delete the new style block, to leave the note as it was.

**Checklist line:**

> **E-06** A graph of 51 things says it has too many to read in one drawing and offers Show as table and a view; Show as table draws it as a table.

**Back to the checklist:** [E-06 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for E-06 in its list.
