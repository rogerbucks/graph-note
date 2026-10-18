# L-06 Too large for the phone

**You should see:** on the iPhone, the export refused before anything is drawn or written: the Export form says "The animated SVG was not made: the path has 201 steps, more than the 200 an animated SVG can play smoothly on this phone. Nothing was saved. To make it fit, export a path of 200 steps or fewer, such as part of this one recorded as a path of its own, or export the drawing as a still SVG." No file appears next to the note. On the Mac, which takes more, the same path exports as an animated SVG.

**Test diagram:**

```gql
// graph: laps · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park),
(laps:Path {title: 'Many laps'}),
(laps)-[:STEP {seq: 1}]->(home), (laps)-[:STEP {seq: 2}]->(park), (laps)-[:STEP {seq: 3}]->(home), (laps)-[:STEP {seq: 4}]->(park), (laps)-[:STEP {seq: 5}]->(home), (laps)-[:STEP {seq: 6}]->(park), (laps)-[:STEP {seq: 7}]->(home), (laps)-[:STEP {seq: 8}]->(park), (laps)-[:STEP {seq: 9}]->(home), (laps)-[:STEP {seq: 10}]->(park),
(laps)-[:STEP {seq: 11}]->(home), (laps)-[:STEP {seq: 12}]->(park), (laps)-[:STEP {seq: 13}]->(home), (laps)-[:STEP {seq: 14}]->(park), (laps)-[:STEP {seq: 15}]->(home), (laps)-[:STEP {seq: 16}]->(park), (laps)-[:STEP {seq: 17}]->(home), (laps)-[:STEP {seq: 18}]->(park), (laps)-[:STEP {seq: 19}]->(home), (laps)-[:STEP {seq: 20}]->(park),
(laps)-[:STEP {seq: 21}]->(home), (laps)-[:STEP {seq: 22}]->(park), (laps)-[:STEP {seq: 23}]->(home), (laps)-[:STEP {seq: 24}]->(park), (laps)-[:STEP {seq: 25}]->(home), (laps)-[:STEP {seq: 26}]->(park), (laps)-[:STEP {seq: 27}]->(home), (laps)-[:STEP {seq: 28}]->(park), (laps)-[:STEP {seq: 29}]->(home), (laps)-[:STEP {seq: 30}]->(park),
(laps)-[:STEP {seq: 31}]->(home), (laps)-[:STEP {seq: 32}]->(park), (laps)-[:STEP {seq: 33}]->(home), (laps)-[:STEP {seq: 34}]->(park), (laps)-[:STEP {seq: 35}]->(home), (laps)-[:STEP {seq: 36}]->(park), (laps)-[:STEP {seq: 37}]->(home), (laps)-[:STEP {seq: 38}]->(park), (laps)-[:STEP {seq: 39}]->(home), (laps)-[:STEP {seq: 40}]->(park),
(laps)-[:STEP {seq: 41}]->(home), (laps)-[:STEP {seq: 42}]->(park), (laps)-[:STEP {seq: 43}]->(home), (laps)-[:STEP {seq: 44}]->(park), (laps)-[:STEP {seq: 45}]->(home), (laps)-[:STEP {seq: 46}]->(park), (laps)-[:STEP {seq: 47}]->(home), (laps)-[:STEP {seq: 48}]->(park), (laps)-[:STEP {seq: 49}]->(home), (laps)-[:STEP {seq: 50}]->(park),
(laps)-[:STEP {seq: 51}]->(home), (laps)-[:STEP {seq: 52}]->(park), (laps)-[:STEP {seq: 53}]->(home), (laps)-[:STEP {seq: 54}]->(park), (laps)-[:STEP {seq: 55}]->(home), (laps)-[:STEP {seq: 56}]->(park), (laps)-[:STEP {seq: 57}]->(home), (laps)-[:STEP {seq: 58}]->(park), (laps)-[:STEP {seq: 59}]->(home), (laps)-[:STEP {seq: 60}]->(park),
(laps)-[:STEP {seq: 61}]->(home), (laps)-[:STEP {seq: 62}]->(park), (laps)-[:STEP {seq: 63}]->(home), (laps)-[:STEP {seq: 64}]->(park), (laps)-[:STEP {seq: 65}]->(home), (laps)-[:STEP {seq: 66}]->(park), (laps)-[:STEP {seq: 67}]->(home), (laps)-[:STEP {seq: 68}]->(park), (laps)-[:STEP {seq: 69}]->(home), (laps)-[:STEP {seq: 70}]->(park),
(laps)-[:STEP {seq: 71}]->(home), (laps)-[:STEP {seq: 72}]->(park), (laps)-[:STEP {seq: 73}]->(home), (laps)-[:STEP {seq: 74}]->(park), (laps)-[:STEP {seq: 75}]->(home), (laps)-[:STEP {seq: 76}]->(park), (laps)-[:STEP {seq: 77}]->(home), (laps)-[:STEP {seq: 78}]->(park), (laps)-[:STEP {seq: 79}]->(home), (laps)-[:STEP {seq: 80}]->(park),
(laps)-[:STEP {seq: 81}]->(home), (laps)-[:STEP {seq: 82}]->(park), (laps)-[:STEP {seq: 83}]->(home), (laps)-[:STEP {seq: 84}]->(park), (laps)-[:STEP {seq: 85}]->(home), (laps)-[:STEP {seq: 86}]->(park), (laps)-[:STEP {seq: 87}]->(home), (laps)-[:STEP {seq: 88}]->(park), (laps)-[:STEP {seq: 89}]->(home), (laps)-[:STEP {seq: 90}]->(park),
(laps)-[:STEP {seq: 91}]->(home), (laps)-[:STEP {seq: 92}]->(park), (laps)-[:STEP {seq: 93}]->(home), (laps)-[:STEP {seq: 94}]->(park), (laps)-[:STEP {seq: 95}]->(home), (laps)-[:STEP {seq: 96}]->(park), (laps)-[:STEP {seq: 97}]->(home), (laps)-[:STEP {seq: 98}]->(park), (laps)-[:STEP {seq: 99}]->(home), (laps)-[:STEP {seq: 100}]->(park),
(laps)-[:STEP {seq: 101}]->(home), (laps)-[:STEP {seq: 102}]->(park), (laps)-[:STEP {seq: 103}]->(home), (laps)-[:STEP {seq: 104}]->(park), (laps)-[:STEP {seq: 105}]->(home), (laps)-[:STEP {seq: 106}]->(park), (laps)-[:STEP {seq: 107}]->(home), (laps)-[:STEP {seq: 108}]->(park), (laps)-[:STEP {seq: 109}]->(home), (laps)-[:STEP {seq: 110}]->(park),
(laps)-[:STEP {seq: 111}]->(home), (laps)-[:STEP {seq: 112}]->(park), (laps)-[:STEP {seq: 113}]->(home), (laps)-[:STEP {seq: 114}]->(park), (laps)-[:STEP {seq: 115}]->(home), (laps)-[:STEP {seq: 116}]->(park), (laps)-[:STEP {seq: 117}]->(home), (laps)-[:STEP {seq: 118}]->(park), (laps)-[:STEP {seq: 119}]->(home), (laps)-[:STEP {seq: 120}]->(park),
(laps)-[:STEP {seq: 121}]->(home), (laps)-[:STEP {seq: 122}]->(park), (laps)-[:STEP {seq: 123}]->(home), (laps)-[:STEP {seq: 124}]->(park), (laps)-[:STEP {seq: 125}]->(home), (laps)-[:STEP {seq: 126}]->(park), (laps)-[:STEP {seq: 127}]->(home), (laps)-[:STEP {seq: 128}]->(park), (laps)-[:STEP {seq: 129}]->(home), (laps)-[:STEP {seq: 130}]->(park),
(laps)-[:STEP {seq: 131}]->(home), (laps)-[:STEP {seq: 132}]->(park), (laps)-[:STEP {seq: 133}]->(home), (laps)-[:STEP {seq: 134}]->(park), (laps)-[:STEP {seq: 135}]->(home), (laps)-[:STEP {seq: 136}]->(park), (laps)-[:STEP {seq: 137}]->(home), (laps)-[:STEP {seq: 138}]->(park), (laps)-[:STEP {seq: 139}]->(home), (laps)-[:STEP {seq: 140}]->(park),
(laps)-[:STEP {seq: 141}]->(home), (laps)-[:STEP {seq: 142}]->(park), (laps)-[:STEP {seq: 143}]->(home), (laps)-[:STEP {seq: 144}]->(park), (laps)-[:STEP {seq: 145}]->(home), (laps)-[:STEP {seq: 146}]->(park), (laps)-[:STEP {seq: 147}]->(home), (laps)-[:STEP {seq: 148}]->(park), (laps)-[:STEP {seq: 149}]->(home), (laps)-[:STEP {seq: 150}]->(park),
(laps)-[:STEP {seq: 151}]->(home), (laps)-[:STEP {seq: 152}]->(park), (laps)-[:STEP {seq: 153}]->(home), (laps)-[:STEP {seq: 154}]->(park), (laps)-[:STEP {seq: 155}]->(home), (laps)-[:STEP {seq: 156}]->(park), (laps)-[:STEP {seq: 157}]->(home), (laps)-[:STEP {seq: 158}]->(park), (laps)-[:STEP {seq: 159}]->(home), (laps)-[:STEP {seq: 160}]->(park),
(laps)-[:STEP {seq: 161}]->(home), (laps)-[:STEP {seq: 162}]->(park), (laps)-[:STEP {seq: 163}]->(home), (laps)-[:STEP {seq: 164}]->(park), (laps)-[:STEP {seq: 165}]->(home), (laps)-[:STEP {seq: 166}]->(park), (laps)-[:STEP {seq: 167}]->(home), (laps)-[:STEP {seq: 168}]->(park), (laps)-[:STEP {seq: 169}]->(home), (laps)-[:STEP {seq: 170}]->(park),
(laps)-[:STEP {seq: 171}]->(home), (laps)-[:STEP {seq: 172}]->(park), (laps)-[:STEP {seq: 173}]->(home), (laps)-[:STEP {seq: 174}]->(park), (laps)-[:STEP {seq: 175}]->(home), (laps)-[:STEP {seq: 176}]->(park), (laps)-[:STEP {seq: 177}]->(home), (laps)-[:STEP {seq: 178}]->(park), (laps)-[:STEP {seq: 179}]->(home), (laps)-[:STEP {seq: 180}]->(park),
(laps)-[:STEP {seq: 181}]->(home), (laps)-[:STEP {seq: 182}]->(park), (laps)-[:STEP {seq: 183}]->(home), (laps)-[:STEP {seq: 184}]->(park), (laps)-[:STEP {seq: 185}]->(home), (laps)-[:STEP {seq: 186}]->(park), (laps)-[:STEP {seq: 187}]->(home), (laps)-[:STEP {seq: 188}]->(park), (laps)-[:STEP {seq: 189}]->(home), (laps)-[:STEP {seq: 190}]->(park),
(laps)-[:STEP {seq: 191}]->(home), (laps)-[:STEP {seq: 192}]->(park), (laps)-[:STEP {seq: 193}]->(home), (laps)-[:STEP {seq: 194}]->(park), (laps)-[:STEP {seq: 195}]->(home), (laps)-[:STEP {seq: 196}]->(park), (laps)-[:STEP {seq: 197}]->(home), (laps)-[:STEP {seq: 198}]->(park), (laps)-[:STEP {seq: 199}]->(home), (laps)-[:STEP {seq: 200}]->(park),
(laps)-[:STEP {seq: 201}]->(home)
```

<!-- expect: clean -->

**Do this:**

1. On the iPhone, press Play Many laps, then Export as an animated SVG, then Export it.
2. Read the form's message: why the animated SVG was not made, that nothing was saved, and how to make it fit.
3. Check that no new file appears next to the note.
4. On the Mac, do the same: the animated SVG is written, and plays in a browser.
5. Delete the file the Mac wrote, to leave the vault as it was.

**Checklist line:**

> **L-06** iPhone: on the note of 201 steps, press Play and Export as an animated SVG, then Export it: the form says the animated SVG was not made, that the path has 201 steps, more than the 200 an animated SVG can play smoothly on this phone, that nothing was saved, and how to make it fit; nothing is written. On the Mac the same path exports.

**Back to the checklist:** [L-06 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for L-06 in its list.
