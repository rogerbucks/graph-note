"""Contexts: where links may join (editor spec §61). The same worlds as the JavaScript library's
packages/graph-spec/test/contexts.test.mjs, with the same answers.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_contexts
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
from graphspec.engine.mesh import contexts as cx  # noqa: E402


def world_of(*blocks):
    st = gp.Store()
    for b in blocks:
        st.apply(b)
    return gr.World.from_store(st)


def contexts(across="FALSE"):
    return "\n".join(
        [
            "// graph: contexts",
            f"(client_a:Context {{kind: 'client', guesses_across: {across}}}),",
            "(client_b:Context {kind: 'client'}),",
            "(drafts:Context {kind: 'folder', path: 'drafts'}),",
            "(a_rates:Ref {graph: 'rates_a'}),",
            "(b_rates:Ref {graph: 'rates_b'}),",
            "(client_a)-[:CONTAINS]->(a_rates),",
            "(client_b)-[:CONTAINS]->(b_rates)",
        ]
    )


RATES_A = "// graph: rates_a\n(rate:Field {name: 'Rate', value: 7}),\n(term:Field {name: 'Term'})"
RATES_B = (
    "// graph: rates_b\n(rate:Field {name: 'Rate', value: 9}),\n"
    "(secret_plan:Plan {name: 'Merger with Acme'})"
)
NOTES_A = "// graph: notes_a\n(rate:Field {name: 'Rate'})"
HOME = "// graph: home\n(term:Field {name: 'Term'})"
NOTES = {"rates_a": "clients/a.md", "rates_b": "clients/b.md", "notes_a": "drafts/a.md"}


def set_up(across="FALSE"):
    w = world_of(contexts(across), RATES_A, RATES_B, NOTES_A, HOME)
    return w, cx.contexts_of(w, notes=NOTES)


class Contexts(unittest.TestCase):
    def test_each_graph_in_one_context(self):
        _, ctx = set_up()
        self.assertEqual(
            ctx["byGraph"],
            {"home": "vault", "notes_a": "drafts", "rates_a": "client_a", "rates_b": "client_b"},
        )
        self.assertEqual(cx.contexts_of(world_of(HOME))["byGraph"], {"home": "vault"})

    def test_guesses_across_off_until_turned_on(self):
        w, ctx = set_up()
        self.assertEqual(cx.context_guesses(w, ctx), [])
        w, ctx = set_up("TRUE")
        self.assertEqual(
            cx.context_guesses(w, ctx),
            [
                {
                    "name": "rate",
                    "things": ["notes_a/rate", "rates_a/rate", "rates_b/rate"],
                    "across": True,
                },
                {"name": "term", "things": ["home/term", "rates_a/term"], "across": True},
            ],
        )
        self.assertEqual(cx.context_guesses(w, ctx, {"acrossContexts": False}), [])

    def test_names_apart(self):
        w, ctx = set_up("TRUE")
        self.assertFalse(cx.comparable(w, ctx, "rates_a/rate", "rates_b/rate"))
        typed = world_of(
            contexts(),
            RATES_A.replace("// graph: rates_a", "// graph: rates_a · schema decision@1"),
            RATES_B.replace("// graph: rates_b", "// graph: rates_b · schema decision@1"),
        )
        typed_ctx = cx.contexts_of(typed)
        self.assertTrue(cx.comparable(typed, typed_ctx, "rates_a/rate", "rates_b/rate"))

    def test_same_as_across_is_a_persons(self):
        _, ctx = set_up()
        start, end = {"graph": "rates_a", "thing": "rate"}, {"graph": "rates_b", "thing": "rate"}
        by_ai = cx.propose_same_as(ctx, start, end, {"kind": "model"})
        self.assertEqual(by_ai["status"], "waiting")
        written = cx.propose_same_as(ctx, start, end, {"kind": "person", "name": "roger"})
        w = world_of(contexts(), RATES_A + ",\n" + written["text"], RATES_B)
        listed = cx.same_as_across(w, cx.contexts_of(w), "client_b")
        self.assertEqual(
            listed,
            [{"from": "rates_a/rate", "to": "rates_b/rate", "contexts": ["client_a", "client_b"]}],
        )

    def test_no_leak(self):
        w, ctx = set_up("TRUE")

        def can_read(c):
            return c != "client_b"

        self.assertNotIn("rates_b", repr(cx.context_guesses(w, ctx, {}, can_read)))
        self.assertEqual(cx.search_contexts(w, ctx, "merger", can_read), [])
        self.assertEqual(cx.search_contexts(w, ctx, "merger"), ["rates_b/secret_plan"])
        self.assertEqual(list(cx.world_in(w, ctx, "client_a")), ["rates_a"])


if __name__ == "__main__":
    unittest.main()
