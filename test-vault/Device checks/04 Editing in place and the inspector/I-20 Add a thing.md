# I-20 Add a thing

**You should see:** after Edit here and Add a thing, a form that asks for the thing's text first, with the focus in it. As you type, the name suggested from the text appears beside it, in the style of the names already in the graph (snake case) and not one of them, with "Suggested name: small_reader. Nothing is written until you press Add the thing." and the text of the block unchanged. With the kind Option and Add the thing pressed, `(small_reader:Option {name: 'Small reader'})` is written after the block's last item, under the name that was shown, and one undo takes it back out. A name typed in its own field is kept as the text changes. No text, a name the graph has, a name of more than one word and a word the language keeps are each refused in words, and nothing is written.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large_reader:Option {name: 'Large reader'}),
(large_reader)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here, then Add a thing. Check the form asks for the text first and the focus is in that field.
2. Type "Small reader" for the text. Check the name small_reader is suggested, the words say nothing is written yet, and the text of the block has not changed.
3. Type "Large reader" for the text instead. Check the suggested name is large_reader_2, never the one the graph has.
4. Put the text back to "Small reader" and give the kind Option. Press Add the thing.
5. Check the new line is written after the last line of the block, with the name that was shown, and the form closes.
6. Press undo once. Check the line goes.
7. Add a thing again, type a name of your own such as tiny, and change the text. Check the name stays tiny.
8. Press Add the thing with no text, then with the name large_reader, then with two words, then with the name match. Check each is refused in words and the text is unchanged.
9. On the phone, check every field and button is easy to hit.

**Checklist line:**

> **I-20** Edit here on a card, press Add a thing: it asks for the thing's text first, with the focus in it. Type some (such as "Small reader"): the name suggested from it appears, in the style of the names already in the graph and not one of them, small_reader, and the text of the block is unchanged. Give the kind Option and press Add the thing: `(small_reader:Option {name: 'Small reader'})` is written after the block's last item, the name shown is the name written, and one undo takes it back out. A name typed in its own field is kept as the text changes. No text, a name the graph has, more than one word, or a word the language keeps is refused in words and nothing is written. Desktop and phone: every field and button is easy to hit.

**Back to the checklist:** [I-20 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-20 in its list.
