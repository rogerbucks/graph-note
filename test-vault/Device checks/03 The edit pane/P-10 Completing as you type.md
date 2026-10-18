# P-10 Completing as you type

**You should see:** in the pane and in the card, typing { showing a faint } after the caret, with the text after it not moving. Tab writes the } with the caret left inside, Escape puts it away until the next typing, and one undo takes back what Tab wrote. Typing the closer yourself where one is already there steps over it. A keyword, a kind, a link type, a property name and a value already used are completed the same way, and Enter takes them too, but Enter never takes a closer. On the phone, Enter takes a word, and the Enter that ends an IME composition takes nothing.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit and put the cursor on a new line at the end of the block. Type `(z:` and check a kind such as Option is offered faintly.
2. Type `{` and check a faint } follows the caret with the text after it unmoved. Press Tab, then undo once.
3. Type `{` again, then press Escape, and check the faint } goes away until you type more.
4. Type the } yourself where one is already there and check it steps over it.
5. Try `MA` for a keyword, `-[:` for a link type, `{` then a property name, and `name: '` for a value already used. Take each with Enter.
6. After a bare `(`, check the names are suggested and Tab takes the first.
7. On the phone, check Enter on the keyboard takes a word, and, with a Japanese keyboard, that the Enter ending a composition takes nothing.

**Checklist line:**

> **P-10** Completing as you type, in the pane and in the card: typing { shows a faint } after the caret. The text after it does not move.
>
> - Tab writes it with the caret left inside. Escape puts it away until the next typing. One undo takes back what Tab wrote.
> - Typing the closer yourself where one is already there steps over it (and a stepped-over ] still gets its colon). One undo goes back to the text as it was on screen.
> - Likewise a keyword (MA), a kind after (z:, a type after -[:, a property name after {, and a value already used after name: '; Enter takes these too. But Enter never takes a closer, and with nothing to take it is a new line.
> - After a bare ( the names are suggested and Tab takes the first, as before.
> - On the phone, Enter on the keyboard takes a word (there is no Tab). Confirm that the Enter ending an IME composition (for example, a Japanese keyboard) takes nothing.

**Back to the checklist:** [P-10 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-10 in its list.
