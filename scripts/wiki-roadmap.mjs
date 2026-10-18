// The wiki's Roadmap page (spec §41, wiki_generated). It shows the waves clustered into phases (shipped, now, next,
// later and held) on one chart. The first release of each minor version is marked on it, and each wave's releases are
// counted beside it.
// scripts/wiki.mjs gives it the waves' states and its own helpers, so both pages count and date things the same way.

/** The phases the roadmap is clustered into, in order. A wave whose title says held is Held whatever its dates. */
const PHASES = ['Shipped', 'Now', 'Next', 'Later', 'Held'];
const NEXT_WAVES = 2;

/** Each wave's phase, given its state: shipped when done, now while running or behind, the next two after that next. */
export function wavePhases(states) {
  let upcoming = 0;
  return states.map((w) => {
    if (/\bheld\b/i.test(w.title)) return 'Held';
    if (w.state === 'done') return 'Shipped';
    if (w.state === 'now' || w.state === 'late') return 'Now';
    return upcoming++ < NEXT_WAVES ? 'Next' : 'Later';
  });
}

/** The releases oldest first, keeping only those whose tag reads as a version. */
function datedReleases(releases) {
  return releases
    .filter((r) => /^v?\d+\.\d+/.test(r.tagName))
    .map((r) => ({ tag: r.tagName, date: r.publishedAt.slice(0, 10) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.tag.localeCompare(b.tag, 'en', { numeric: true }));
}

/** The first release of each minor version, the ones the roadmap marks. */
function minorReleases(dated) {
  const seen = new Set();
  return dated.filter((r) => {
    const minor = r.tag.match(/^v?(\d+\.\d+)/)[1];
    return !seen.has(minor) && seen.add(minor);
  });
}

/**
 * The Roadmap page's Markdown. `states` are the waves with their counts and states (waveStates of wiki.mjs).
 * `releases` is GitHub's list (or empty). `counted`, `day`, `footer` and `STATE_MARK` are the helpers of wiki.mjs.
 */
export function roadmapPage(
  { states, workstreams, requirements, releases, sha, today },
  { counted, day, footer, STATE_MARK },
) {
  const phases = wavePhases(states);
  const dated = datedReleases(releases);
  const shipped = (w) => dated.filter((r) => r.date >= w.start && r.date <= w.end);
  const shippedCell = (w) => {
    const of = shipped(w);
    return of.length ? `${of.length} (${of[0].tag}${of.length > 1 ? ` to ${of.at(-1).tag}` : ''})` : '—';
  };
  const wavesTable = [
    '| Wave | Dates | Proved | State | Releases |',
    '|---|---|---|---|---|',
    ...states.map(
      (w) =>
        `| ${w.title} | ${day(w.start)} to ${day(w.end)}${w.estimate ? ' (estimate)' : ''} | ` +
        `${w.total ? `${w.proved} / ${w.total}` : '—'} | ${w.total || w.state !== 'done' ? STATE_MARK[w.state] : '—'} | ` +
        `${shippedCell(w)} |`,
    ),
  ].join('\n');
  const present = PHASES.filter((p) => phases.includes(p));
  const safe = (text) => text.replace(/[:#;,]/g, ' ');
  const milestones = minorReleases(dated);
  const gantt = [
    '```mermaid',
    'gantt',
    '  dateFormat YYYY-MM-DD',
    '  axisFormat %d %b',
    ...present.flatMap((p) => [
      `  section ${p}`,
      ...states
        .filter((_, i) => phases[i] === p)
        .map(
          (w) =>
            `  ${safe(w.title)} :${w.state === 'done' ? 'done, ' : w.state === 'now' ? 'active, ' : w.state === 'late' ? 'crit, ' : ''}${w.start}, ${w.end}`,
        ),
    ]),
    ...(milestones.length
      ? ['  section Releases', ...milestones.map((r) => `  ${safe(r.tag)} :milestone, ${r.date}, 0d`)]
      : []),
    '```',
  ].join('\n');
  const workstreamList = (w) =>
    `### ${w.title}\n\n` +
    w.workstreams
      .map((k) => {
        const c = counted(workstreams[k]?.requirements ?? [], requirements);
        return `- **${workstreams[k]?.title ?? k}** (${k}): ${c.proved} of ${c.total} proved`;
      })
      .join('\n');
  return (
    `# Roadmap\n\nThe order the work is planned in, clustered into phases: shipped, now, the next ${NEXT_WAVES} waves, ` +
    `later, and held. Diamonds mark the first release of each minor version. Dates marked as estimates are plans, not ` +
    `promises.\n\n${gantt}\n\n${wavesTable}\n\n` +
    present
      .map((p) => {
        const of = states.filter((w, i) => phases[i] === p && w.workstreams.length);
        return `## ${p}\n\n${of.length ? of.map(workstreamList).join('\n\n') : '_No workstreams listed._'}`;
      })
      .join('\n\n') +
    footer(
      `\`requirements/waves.json\`, \`requirements/workstreams.json\`${releases.length ? ' and GitHub releases' : ''}`,
      sha,
      today,
    )
  );
}
