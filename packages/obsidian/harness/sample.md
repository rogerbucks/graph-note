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
```gql
// graph: reader · SOURCE
(a4_pages:Reason {title: 'A4 pages need a screen of about 10 inches or more'}),
(easy_on_eyes:Reason {title: 'E-ink is easier on the eyes over long sessions'}),
(costs_nothing:Reason {title: 'The tablet costs nothing extra'}),
(a4_pages)-[:FAVOURS]->(large_reader),
(a4_pages)-[:COUNTS_AGAINST]->(small_reader),
(easy_on_eyes)-[:FAVOURS]->(large_reader),
(easy_on_eyes)-[:FAVOURS]->(small_reeder),
(costs_nothing)-[:FAVOURS]->(tablet)
```
A query is shown as code.
```gql
// graph: reader · QUERY
MATCH (r:Reason)-[:FAVOURS]->(o:Option) RETURN o.name, count(r)
```
An empty graph.
```gql
// graph: fresh
```
