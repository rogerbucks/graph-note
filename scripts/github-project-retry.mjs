// How the GitHub mirror (github-project-gh.mjs) goes on after a call to gh fails for a short while: a secondary rate limit
// is waited out once; a transient failure (a network timeout or reset connection, a 502, 503 or 504, "Bad Gateway",
// "something went wrong") is waited out up to three times, after 5, 15 and 45 seconds. A call that only reads is simply
// tried again. A call that changes something is tried again only where that cannot do it twice: a create first looks
// for what it was making, and a call that a second try could repeat (a comment, a new field) is not tried again at
// all, so the run stops as it always did and the next run resumes. Nothing here touches the network itself.

/** The waits before the first, second and third retry of a call that failed in a transient way, in milliseconds. */
export const RETRY_DELAYS_MS = [5000, 15000, 45000];
const RATE_LIMITED = /secondary rate limit|submitted too quickly|abuse detection/i;
/** A failure worth trying again: a network timeout or reset connection, a 502, 503 or 504, or GitHub's own "went wrong". */
const TRANSIENT =
  /i\/o timeout|timed out|timeout|connection reset|reset by peer|\b50[234]\b|bad gateway|service unavailable|gateway time-?out|something went wrong/i;

const inRepo = (repo, args) => [...args, '--repo', repo];
/** Waits, blocking, for the given milliseconds. */
export const waitFor = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Runs a call; on a secondary rate limit, waits once and runs it once more. Any other failure goes on up. */
function rateLimited(run, sleep, retryMs, args, input) {
  try {
    return run(args, input);
  } catch (e) {
    if (!RATE_LIMITED.test(String(e.message))) throw e;
    sleep(retryMs);
    return run(args, input);
  }
}

/** Runs a call, trying it again after each wait in `delays` when it fails in a transient way. `settled()` may end the tries early. */
function withTries(attempt, sleep, delays, settled) {
  for (let tries = 0; ; tries += 1) {
    try {
      return attempt();
    } catch (e) {
      if (!TRANSIENT.test(String(e.message)) || tries >= delays.length) throw e;
      sleep(delays[tries]);
      const done = settled?.();
      if (done) return done.value;
    }
  }
}

/**
 * Wraps a runner for the calls that only read: a transient failure is waited out (`delays`) and the call tried again, up
 * to three times. Any other failure, and a fourth transient one, goes on up. `sleep` is blocking, in milliseconds.
 */
export function retrying(run, { sleep = waitFor, delays = RETRY_DELAYS_MS } = {}) {
  return (args, input) => withTries(() => run(args, input), sleep, delays);
}

/**
 * For a call that changes something, how to find out after a transient failure whether it already went through: gives a
 * function that re-reads what GitHub holds and returns {value} (what the call would have given) when the thing is there,
 * else undefined. A create has one. A call that changes only to a state it is given (an edit, a close, a reopen, adding
 * to a project, setting a value, replacing a field's options) gives one that always says undefined, so it is simply tried
 * again. A call a second try could repeat (a comment, a new field) gives null: it is not tried again.
 */
function lookup(args, input, read, caps) {
  const [group, verb] = args;
  const flag = (name) => args[args.indexOf(name) + 1];
  if (group === 'issue' && verb === 'create') {
    const list = inRepo(flag('--repo'), [
      ...['issue', 'list', '--state', 'all', '--limit', String(caps.issues), '--json', 'number,title,body,url'],
    ]);
    return () => {
      const made = JSON.parse(read(list)).find((i) => i.title === flag('--title') && i.body === input);
      return made && { value: `${made.url}\n` };
    };
  }
  if (group === 'label' && verb === 'create') {
    const list = inRepo(flag('--repo'), ['label', 'list', '--limit', String(caps.labels), '--json', 'name']);
    return () => (JSON.parse(read(list)).some((l) => l.name === args[2]) ? { value: '' } : undefined);
  }
  if (group === 'project' && verb === 'create') {
    const list = ['project', 'list', '--owner', flag('--owner'), '--format', 'json', '--limit', String(caps.projects)];
    return () => {
      const made = JSON.parse(read(list)).projects.find((p) => p.title === flag('--title'));
      return made && { value: JSON.stringify({ id: made.id, number: made.number }) };
    };
  }
  const once = (group === 'issue' && verb === 'comment') || (group === 'api' && /createProjectV2Field/.test(input));
  return once ? null : () => undefined;
}

/**
 * Wraps a runner for the calls that change something: a pause before each but the first, on a secondary rate limit one
 * wait and one more try, and on a transient failure up to three more tries after the `delays`. Before it tries a create
 * again it re-reads what GitHub holds (`caps` are the most labels, issues and projects a list is asked for), and if the
 * create went through it takes that and does not make a second. A call that a second try could repeat (a comment, a new
 * field) is not tried again. Any other failure goes on up.
 */
export function paced(run, { sleep, pauseMs, retryMs, delays, caps }) {
  let first = true;
  const read = retrying(run, { sleep, delays });
  return (args, input) => {
    if (!first) sleep(pauseMs);
    first = false;
    const check = lookup(args, input, read, caps);
    return withTries(
      () => rateLimited(run, sleep, retryMs, args, input),
      sleep,
      check ? delays : [],
      () => {
        try {
          return check();
        } catch {
          return undefined; // the re-read failed too; try the call again, as the failure said
        }
      },
    );
  };
}
