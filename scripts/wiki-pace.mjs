// The plan stays true to the work (spec §41, waves_on_time). Two checks keep it so.
// - A wave left behind too long fails the build, unless requirements/waves.json says why.
// - The Roadmap page shows the pace: how many requirements were proved in the last fortnight.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBoard } from './slice-board.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86_400_000;
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

/** An ISO date as the wiki writes it, such as 9 Oct 2026. */
export const day = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The waves that are too far behind. A wave is too far behind when its end passed more than one wave length ago.
 * A late_reason in waves.json lets it be. Otherwise the build fails until its work moves and the dates shift.
 */
export function overdueWaves(states, today) {
  return states.filter(
    (w) => w.state === 'late' && !w.late_reason && daysBetween(w.end, today) > daysBetween(w.start, w.end) + 1,
  );
}

/**
 * The Roadmap page's line on the pace: requirements proved in the last fortnight. When the history is shorter, it
 * counts from where the history begins. `then` is {date, proved} from that time, or null to say nothing.
 */
export function paceLine({ proved, then }, today) {
  if (!then) return '';
  const count = proved - then.proved;
  return daysBetween(then.date, today) >= 14
    ? `**Pace:** ${count} requirements proved in the last fortnight.`
    : `**Pace:** ${count} requirements proved since ${day(then.date)}, when the history begins.`;
}

/**
 * The requirements as they stood a fortnight before `today`, as {date, proved}. When the history is shorter, it is
 * their first commit. It is null in a shallow clone, whose history is cut short.
 */
export function provedAFortnightAgo(today) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  const file = 'requirements/editor-requirements.gql';
  try {
    if (git('rev-parse', '--is-shallow-repository') === 'true') return null;
    const before = new Date(Date.parse(today) - 14 * DAY).toISOString().slice(0, 10);
    const commit =
      git('rev-list', '-1', `--before=${before}T23:59:59Z`, 'HEAD', '--', file) ||
      git('rev-list', '--reverse', 'HEAD', '--', file).split('\n')[0];
    if (!commit) return null;
    const { requirements } = readBoard(git('show', `${commit}:${file}`));
    return {
      date: git('show', '-s', '--format=%cs', commit),
      proved: requirements.filter((r) => r.status === 'proved').length,
    };
  } catch {
    return null;
  }
}
