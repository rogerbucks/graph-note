# A sample graph note
The question, its options and the reasons for each, built up in steps.
```gql
// graph: reader · SOURCE
(reader_question:Question {
    title: 'Which device should I read long PDFs on?'}),
(large_reader:Option {name: 'Large e-ink reader'}),
(small_reader:Option {name: 'Small e-ink reader'}),
(tablet:Option {name: 'Keep using the tablet'}),
(large_reader)-[:ANSWERS]->(reader_question),
(small_reader)-[:ANSWERS]->(reader_question),
(tablet)-[:ANSWERS]->(reader_question)
```
Then the reasons, one of them with a typo in a link.
