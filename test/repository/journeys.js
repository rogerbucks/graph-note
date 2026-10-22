// The first-run journey in every host, run for its counts (editor spec §41, ux_journey_auto). It gives the metrics the
// quality ratchet holds (scripts/quality-spec.mjs), and each host's trail of interactions, for a person to read. It is
// run by test/ux-journey.test.js in CI, and by scripts/quality-metrics.mjs for a release. Test code only.
import { build } from '../../packages/obsidian/test/host/load-plugin.js';
import { cleanUp } from '../../packages/claude-code/test/editor-page-support.js';
import { obsidianJourney } from './journey-obsidian.js';
import { pageJourney } from './journey-page.js';
import { appJourney } from './journey-app.js';
import { cleanUpApp } from '../../packages/app/test/app-window.js';

/** Each host's journey, by the host's name in scripts/ux-journey.mjs. */
export const JOURNEYS = { obsidian: obsidianJourney, 'claude-code': pageJourney, app: appJourney };

/** Runs every host's journey: `{ metrics, details: { journeys } }`, each host's trail under its name. */
export async function measureJourneys() {
  build();
  const metrics = {},
    journeys = {};
  try {
    for (const [host, run] of Object.entries(JOURNEYS)) {
      const person = await run();
      Object.assign(metrics, person.metrics());
      journeys[host] = person.trail;
    }
  } finally {
    await cleanUp();
    cleanUpApp();
  }
  return { metrics, details: { journeys } };
}
