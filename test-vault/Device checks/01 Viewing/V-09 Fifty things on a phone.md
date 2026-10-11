# V-09 Fifty things on a phone

**You should see:** the 50 things and their links drawn in under half a second on the phone, with the bar and the badge in place. The drawing is the whole graph, not text.

**Test diagram:**

```gql
// graph: fifty · SOURCE
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
(t01)-[:NEXT]->(t02)-[:NEXT]->(t03)-[:NEXT]->(t04)-[:NEXT]->(t05)-[:NEXT]->(t06)-[:NEXT]->(t07)-[:NEXT]->(t08)-[:NEXT]->(t09)-[:NEXT]->(t10),
(t10)-[:NEXT]->(t11)-[:NEXT]->(t12)-[:NEXT]->(t13)-[:NEXT]->(t14)-[:NEXT]->(t15)-[:NEXT]->(t16)-[:NEXT]->(t17)-[:NEXT]->(t18)-[:NEXT]->(t19)-[:NEXT]->(t20),
(t20)-[:NEXT]->(t21)-[:NEXT]->(t22)-[:NEXT]->(t23)-[:NEXT]->(t24)-[:NEXT]->(t25)-[:NEXT]->(t26)-[:NEXT]->(t27)-[:NEXT]->(t28)-[:NEXT]->(t29)-[:NEXT]->(t30),
(t30)-[:NEXT]->(t31)-[:NEXT]->(t32)-[:NEXT]->(t33)-[:NEXT]->(t34)-[:NEXT]->(t35)-[:NEXT]->(t36)-[:NEXT]->(t37)-[:NEXT]->(t38)-[:NEXT]->(t39)-[:NEXT]->(t40),
(t40)-[:NEXT]->(t41)-[:NEXT]->(t42)-[:NEXT]->(t43)-[:NEXT]->(t44)-[:NEXT]->(t45)-[:NEXT]->(t46)-[:NEXT]->(t47)-[:NEXT]->(t48)-[:NEXT]->(t49)-[:NEXT]->(t50)
```

<!-- expect: clean -->

**Do this:**

1. On the phone, in aeroplane mode, open this note and scroll to the block.
2. Time how long the drawing takes to appear after the block comes into view. It should feel immediate, under half a second.

**Checklist line:**

> **V-09** A 50-thing graph is drawn in under half a second on the phone (§11).

**Back to the checklist:** [V-09 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-09 in its list.
