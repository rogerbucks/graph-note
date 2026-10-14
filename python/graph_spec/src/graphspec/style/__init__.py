"""The style graph (editor spec §2, §6, §7, §14, §15, §25): a graph's nudges, the properties it
shows inline, where it hides arrowheads, the diagram type it chooses, how its links move and how
they are routed and merged, read from its style blocks and checked as the plugin's core reads and
checks them, so graph_svg draws a styled graph as the plugin does (python_honours_nudges,
arrows_both_renderers, type_both_renderers, links_show_flow). The words and keys, the near names a
fix offers, each thing checked, the things checked against each other, the reading of a graph's
style blocks, the nudges, arrowheads hidden, properties shown and links moved, written into the
layout source, which diagram types fit a graph and how each is laid out, and what a View menu folds
and merges, written into the source last when asked (untangle_hubs, untangle_groups,
untangle_merge, untangle_routing)."""
