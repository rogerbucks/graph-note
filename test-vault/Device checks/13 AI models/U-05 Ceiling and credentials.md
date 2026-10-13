# U-05 Ceiling and credentials

**You should see:** a note with no classification is not sent to any model until it is given one, and a note classified above the chosen model's ceiling is not sent to it. The dialog says why, names a model that is cleared for the note when one is set up, and Send stays off. A note at the highest classification set is never sent to any model, whatever its ceiling, and neither is one that holds something shaped like a password.

**Test diagram:**

```gql
// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(large_reader)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): the command writes its answer into the note, so it is refused in reading view.
1. Set the Remote model's ceiling to Public and the Local model's to Internal. Run "Ask an AI model to propose changes" on this note as it is, with no classification, and press Show what will be sent. Check it says the note has no classification and to give it one, and Send stays off.
2. Add front matter to this note giving it the classification Internal (a `classification` property of Internal). Run "Ask an AI model to propose changes", choose Remote and press Show what will be sent. Check it says the note is above Remote's ceiling, names Local as cleared for it, and Send stays off.
3. Change the note's classification to Restricted, the highest. Check nothing may be sent to either model, and the dialog says it is the highest classification.
4. Put the classification back to Public, and add `pass` followed by `word: 'not-a-real-one'` as a property of Large reader. Check Show what will be sent says the note holds what looks like a password and sends nothing.
5. Take the front matter and the property out again when you are done.

**Checklist line:**

> **U-05** Give the note a classification above the chosen model's ceiling: Show what will be sent says why, names a model cleared for it, and Send stays off. With no classification, or at the highest classification set, nothing is sent to any model; nor is a note holding a password property.

**Back to the checklist:** [U-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for U-05 in its list.
