// The speed budgets (editor spec §41, speed_budgets): the most CPU instructions each host may spend drawing 50 things
// and 500, on a query over a 10 000-thing mesh, and on a cold start. Each is the ceiling of a benchmark's claim, so a
// count over it breaks the claim and fails the release's quality job whatever the baseline says; the ratchet's own
// tolerance (quality-spec.mjs, wider for the drawings) still holds each count to its last. Counts are Cachegrind's, on the release's runner; a budget
// set from counts is the highest of them and a fifth more, as the drawings' counts move from run to run there.

/** Each budget: the most instructions, and where the number comes from. */
export const SPEED_BUDGETS = {
  draw_fifty: {
    most: 2_000_000_000,
    why: 'half a second on a mid-range phone’s big core at about 4 instructions a nanosecond (spec §11, fifty_in_half_second); one draw was about 590 million by Apple silicon’s hardware counter (12 Oct 2026)',
  },
  draw_five_hundred: {
    most: 7_700_000_000,
    why: 'the highest of its two cases over four counts, 6.39 billion, on the release runner (Linux x86-64, Node 24.20.0, 18 Oct 2026), and a fifth more',
  },
  mesh_query: {
    most: 148_000_000,
    why: 'the larger of its two queries, 122.7 million, the same in all four counts on the release runner (Linux x86-64, Node 24.20.0, 18 Oct 2026), and a fifth more',
  },
  cold_start_obsidian: {
    most: 2_400_000_000,
    why: 'the highest of four counts of the plugin’s first drawing, 2.00 billion, on the release runner (Linux x86-64, Node 24.20.0, 18 Oct 2026), and a fifth more',
  },
  cold_start_claude_code: {
    most: 2_000_000_000,
    why: 'the highest of four counts of the pane’s first drawing, 1.65 billion, on the release runner (Linux x86-64, Node 24.20.0, 18 Oct 2026), and a fifth more',
  },
};

/** A claim that the count of `which` stays within the budget `budget`: [counted, allowed], held when counted < allowed. */
export const withinBudget = (budget, which, says) => ({
  budget,
  says,
  of: (counts) => [counts[which], SPEED_BUDGETS[budget].most],
});
