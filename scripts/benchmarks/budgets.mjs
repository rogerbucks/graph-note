// The speed budgets (editor spec §41, speed_budgets): the most CPU instructions each host may spend drawing 50 things
// and 500, on a query over a 10 000-thing mesh, and on a cold start. Each is the ceiling of a benchmark's claim, so a
// count over it breaks the claim and fails the release's quality job whatever the baseline says; the ratchet's own 5%
// tolerance (quality-spec.mjs) still holds each count to its last. Counts are Cachegrind's, on Linux x86-64; a budget set
// from a count is that count and a fifth more, to be checked again by the "Quality baseline" job on the release's runner.

/** Each budget: the most instructions, and where the number comes from. */
export const SPEED_BUDGETS = {
  draw_fifty: {
    most: 2_000_000_000,
    why: 'half a second on a mid-range phone’s big core at about 4 instructions a nanosecond (spec §11, fifty_in_half_second); one draw was about 590 million by Apple silicon’s hardware counter (12 Oct 2026)',
  },
  draw_five_hundred: {
    most: 12_600_000_000,
    why: 'the larger of its two cases, 7.62 billion, counted on Linux x86-64 under Node 22 (18 Oct 2026), times 1.36 for the release runner (as draw_fifty counts there), and a fifth more',
  },
  mesh_query: {
    most: 148_000_000,
    why: 'the larger of its two queries, 122.8 million, counted on the release runner (Linux x86-64, Node 24.20.0, 18 Oct 2026), and a fifth more',
  },
  cold_start_obsidian: {
    most: 3_150_000_000,
    why: 'the plugin’s first drawing, 1.90 billion, counted on Linux x86-64 under Node 22 (18 Oct 2026), times 1.36 for the release runner, and a fifth more',
  },
  cold_start_claude_code: {
    most: 3_230_000_000,
    why: 'the pane’s first drawing, 1.95 billion, counted on Linux x86-64 under Node 22 (18 Oct 2026), times 1.36 for the release runner, and a fifth more',
  },
};

/** A claim that the count of `which` stays within the budget `budget`: [counted, allowed], held when counted < allowed. */
export const withinBudget = (budget, which, says) => ({
  budget,
  says,
  of: (counts) => [counts[which], SPEED_BUDGETS[budget].most],
});
