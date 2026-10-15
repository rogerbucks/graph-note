// The waves plan of the GitHub mirror (spec §12, requirements_checked_in_ci): requirements/waves.json lists the waves in
// order, each with its workstreams in order and planned start and end dates, marked as estimates. It is the one place the
// order of the work lives. From it the mirror derives each requirement's Wave (the project's iteration field, one
// iteration for each wave, with its dates) and Order (a number: the wave's position, then the workstream's, then the
// requirement's). Pure: text and values in, values out. The fields are set by github-project-gh.mjs.

/** The plan, beside the workstreams file. */
export const WAVES_FILE = 'requirements/waves.json';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
/** Order is the wave's position times this, plus the workstream's times STEP, plus the requirement's. */
const WAVE_STEP = 10_000;
const STEP = 100;

const dayOf = (text) => {
  const [y, m, d] = text.split('-').map(Number);
  const at = Date.UTC(y, m - 1, d);
  return new Date(at).toISOString().slice(0, 10) === text ? at : null;
};

function readDay(wave, key) {
  const text = wave[key];
  if (typeof text !== 'string' || !DAY.test(text)) throw new Error(`wave "${wave.title}": ${key} must be YYYY-MM-DD`);
  const at = dayOf(text);
  if (at === null) throw new Error(`wave "${wave.title}": ${key} ${text} is not a day`);
  return at;
}

function readWave(wave, workstreams, seen) {
  if (wave === null || typeof wave !== 'object' || typeof wave.title !== 'string' || !wave.title.trim())
    throw new Error('every wave needs a title, as text');
  if (seen.titles.has(wave.title)) throw new Error(`two waves are titled "${wave.title}"`);
  seen.titles.add(wave.title);
  const [start, end] = [readDay(wave, 'start'), readDay(wave, 'end')];
  if (end < start) throw new Error(`wave "${wave.title}" ends before it starts`);
  if (typeof wave.estimate !== 'boolean')
    throw new Error(`wave "${wave.title}": estimate must be true or false, saying whether its dates are estimates`);
  if (!Array.isArray(wave.workstreams)) throw new Error(`wave "${wave.title}": workstreams must be a list of ids`);
  for (const id of wave.workstreams) {
    if (typeof id !== 'string' || !Object.hasOwn(workstreams, id))
      throw new Error(`wave "${wave.title}": ${id} is not a workstream of the workstreams file`);
    if (seen.workstreams.has(id))
      throw new Error(`${id} is in two waves, "${seen.workstreams.get(id)}" and "${wave.title}"`);
    seen.workstreams.set(id, wave.title);
  }
  return {
    title: wave.title,
    start: wave.start,
    end: wave.end,
    estimate: wave.estimate,
    workstreams: [...wave.workstreams],
    from: start,
    to: end,
  };
}

/**
 * Reads the waves file against the workstreams (as readWorkstreams gives them): {waves: [{title, start, end, estimate,
 * workstreams}]}, in order. Throws, naming what is wrong, for anything else: no waves, a wave with no title or one two
 * waves share, a date that is not a day, an end before its start, an estimate mark that is not true or false, a
 * workstream the file does not hold or one in two waves, and a wave that starts before the one before it ends.
 */
export function readWaves(text, workstreams) {
  let file;
  try {
    file = JSON.parse(text);
  } catch (e) {
    throw new Error(`the waves file is not JSON: ${e.message}`);
  }
  if (file === null || typeof file !== 'object' || !Array.isArray(file.waves))
    throw new Error('the waves file must be a JSON object whose waves are a list');
  if (!file.waves.length) throw new Error('the waves file must hold at least one wave');
  const seen = { titles: new Set(), workstreams: new Map() };
  const waves = file.waves.map((w) => readWave(w, workstreams, seen));
  for (let i = 1; i < waves.length; i += 1)
    if (waves[i].from <= waves[i - 1].to)
      throw new Error(`wave "${waves[i].title}" starts before "${waves[i - 1].title}" ends`);
  return { waves: waves.map(({ from: _from, to: _to, ...wave }) => wave) };
}

/** The iterations of the Wave field: one for each wave, {title, startDate, duration (days, both ends counted)}. */
export function iterationsOf(plan) {
  return plan.waves.map((w) => ({
    title: w.title,
    startDate: w.start,
    duration: Math.round((dayOf(w.end) - dayOf(w.start)) / DAY_MS) + 1,
  }));
}

/**
 * The wave and order of each requirement, as a Map from its id to {wave (the wave's title), order}. `requirements` are in
 * the copy's order, `placed` maps each to its workstream (assignWorkstreams), and `workstreams` is the workstreams file.
 * Within a workstream the requirements it lists come first, in its order, then those it holds by default, in the copy's.
 * A requirement whose workstream is in no wave is not in the Map. Throws when a wave has 100 workstreams or a workstream
 * 100 requirements, which Order cannot tell apart.
 */
export function wavesOf(requirements, placed, workstreams, plan) {
  const found = new Map();
  plan.waves.forEach((wave, w) => {
    wave.workstreams.forEach((ws, s) => {
      const listed = workstreams[ws].requirements.filter((id) => placed.get(id) === ws);
      const rest = requirements.map((r) => r.id).filter((id) => placed.get(id) === ws && !listed.includes(id));
      const members = [...listed, ...rest];
      if (s + 1 >= STEP || members.length >= STEP)
        throw new Error(`wave "${wave.title}" or its workstream ${ws} is too large for Order to number`);
      members.forEach((id, r) =>
        found.set(id, { wave: wave.title, order: (w + 1) * WAVE_STEP + (s + 1) * STEP + r + 1 }),
      );
    });
  });
  return found;
}

const count = (list, status) => list.filter((i) => i.status === status).length;
const proofs = (list) => `${count(list, 'proved')} proved · ${count(list, 'part')} part · ${count(list, 'open')} open`;

/**
 * The lines the mirror prints of the plan: for each wave its dates (marked when they are estimates) and the count of its
 * requirements by proof; then how many requirements are in no wave, and a warning for each of those not proved. None
 * when the desired state has no plan. `desired.waves` is the plan, with the ids of the requirements (not the questions)
 * of the chosen slices as its `requirements`.
 */
export function waveLines(desired) {
  if (!desired.waves) return [];
  const ids = new Set(desired.waves.requirements);
  const requirements = desired.issues.filter((i) => ids.has(i.id));
  const lines = desired.waves.waves.map((w) => {
    const mine = requirements.filter((i) => i.wave === w.title);
    const dates = `${w.start} to ${w.end}${w.estimate ? ', estimate' : ''}`;
    return `wave ${w.title} (${dates}): ${mine.length} requirements · ${proofs(mine)}`;
  });
  const none = requirements.filter((i) => i.wave === null);
  const flagged = none.filter((i) => i.status !== 'proved');
  if (none.length) lines.push(`in no wave: ${none.length} requirements, ${flagged.length} of them not proved`);
  for (const i of flagged) lines.push(`warning: requirement ${i.id} (${i.status}) is in no wave`);
  return lines;
}
