# S-07 Put a thing in the centre

**You should see:** in a radial drawing, Put in the centre in a box's details, or C on the box, lays the drawing out again around that box. The boxes glide to their new rings, and the strip says "Centred on …" with Back to the usual centre. In reading view it is only looked at, never saved.

**Test diagram:**

```gql
// graph: sky · SOURCE
(sun:Thing {name: 'Sun'}),
(earth:Thing {name: 'Earth'}),
(mars:Thing {name: 'Mars'}),
(moon:Thing {name: 'The moon'}),
(earth)-[:CIRCLES]->(sun),
(mars)-[:CIRCLES]->(sun),
(moon)-[:CIRCLES]->(earth)
```

```gql
// graph: sky_style · STYLE sky
(d1:Diagram {type: 'radial'})
```

<!-- expect: clean -->

**Do this:**

1. In Live Preview, open The moon's details and press Put in the centre. The boxes glide, The moon sits in the middle, and the strip says "Centred on The moon."
2. Press Back to the usual centre. The boxes glide back around Sun.
3. Tab to Mars's box and press C: Mars goes in the centre.
4. In reading view, press C on Earth's box. It is drawn around Earth and says "Just looking: not saved." Back to saved puts it back.
5. Turn on reduced motion in the system settings and do step 1 again: the boxes move at once.
6. Run `scripts/reset-test-vault.mjs` afterwards, to take the centre out again.

**Checklist line:**

> **S-07** In a radial drawing, open a box's details and press Put in the centre. The boxes glide to their new rings around it, and the strip says "Centred on …". Back to the usual centre glides them back. Tab to a box and press C: the same. In reading view it is only looked at: "Just looking: not saved." With reduced motion on, the boxes move at once.

**Back to the checklist:** [S-07 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for S-07 in its list.
