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
  /i\/o timeout|context deadline exceeded|timed out waiting|tls handshake timeout|connection reset|reset by peer|\b50[234]\b|bad gateway|service unavailable|gateway time-?out|something went wrong/i;

/**
 * gh's own words in a failure: the stderr ghRunner keeps on its error, else the message without its leading `gh … failed: `,
 * so the arguments of the call (an issue number 503, a title with "timeout" in it) are never taken for gh's words.
 */
const wordsOf = (e) => (typeof e.stderr === 'string' ? e.stderr : String(e.message).replace(/^gh .*? failed: /s, ''));
const isTransient = (e) => TRANSIENT.test(wordsOf(e));

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
      if (!isTransient(e) || tries >= delays.length) throw e;
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
 * Wraps a runner for the calls that change something: a pause before each but the first, on a secondary rate limit one
 * wait and one more try, and on a transient failure up to three more tries after the `delays`. `lookup(args, input,
 * read)` says, for a call, how to find out whether it already went through: null when a second try could repeat it
 * (then it is not tried again), else a function that re-reads what GitHub holds, through `read`, and gives {value} (what
 * the call would have given) when the thing is there, else undefined. It runs before each retry, and when the re-read
 * itself fails for good, that failure stops the run: a call is never made again on a look that did not happen. Any
 * other failure goes on up.
 */
export function paced(run, { sleep, pauseMs, retryMs, delays, lookup }) {
  let first = true;
  const read = retrying(run, { sleep, delays });
  return (args, input) => {
    if (!first) sleep(pauseMs);
    first = false;
    const check = lookup(args, input, read);
    return withTries(() => rateLimited(run, sleep, retryMs, args, input), sleep, check ? delays : [], check);
  };
}
