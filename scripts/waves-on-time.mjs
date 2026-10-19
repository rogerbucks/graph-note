// The plan stays true to the work (spec §41, waves_on_time). A wave left behind too long fails the build, unless
// requirements/waves.json says why. The pace itself is on the wiki's Plan versus actual page (plan-actuals.mjs).

const DAY = 86_400_000;
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

/**
 * The waves that are too far behind. A wave is too far behind when its end passed more than one wave length ago.
 * A late_reason in waves.json lets it be. Otherwise the build fails until its work moves and the dates shift.
 */
export function overdueWaves(states, today) {
  return states.filter(
    (w) => w.state === 'late' && !w.late_reason && daysBetween(w.end, today) > daysBetween(w.start, w.end) + 1,
  );
}
