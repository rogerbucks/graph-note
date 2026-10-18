// The speed budgets (editor spec §41, speed_budgets): the most CPU instructions each host may spend drawing 50 things
// and 500, on a query over a 10 000-thing mesh, and on a cold start. Each is the ceiling of a benchmark's claim, so a
// count over it breaks the claim and fails the release's quality job whatever the baseline says; the ratchet's own 5%
// tolerance (quality-spec.mjs) still holds each count to its last. Counts are Cachegrind's, on Linux x86-64; a budget set
// from a count is that count and a fifth more, to be checked again by the "Quality baseline" job on the release's runner.

/** Each budget: the most instructions, and where the number comes from. */
export const SPEED_BUDGETS = {
  draw_fifty: {
    most: 2_000_000_000,
    why: 'half a second on a mid-range phone’s big core at about 4 instructions a nanosecond (spec §11, fifty_in_half_second)',
  },
  draw_five_hundred: {
    most: 0,
    why: '',
  },
  mesh_query: {
    most: 0,
    why: '',
  },
  cold_start_obsidian: {
    most: 0,
    why: '',
  },
  cold_start_claude_code: {
    most: 0,
    why: '',
  },
};

/** A claim that the count of `which` stays within the budget `budget`: [counted, allowed], held when counted < allowed. */
export const withinBudget = (budget, which, says) => ({
  budget,
  says,
  of: (counts) => [counts[which], SPEED_BUDGETS[budget].most],
});
