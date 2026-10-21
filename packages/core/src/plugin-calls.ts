// Every call into a plug-in, timed, caught and named (editor spec §43, plugin_manifest_limits). A call that throws is
// named with its plug-in, never let through to blank a drawing. A call over the time limit is named and its answer
// dropped. Its plug-in is stopped, so nothing of it is called again. A call whose answer comes later is timed until it
// comes. One that never answers is not stopped here: that waits for plug-ins running apart, in a worker (TRUST-14).

/** The answer of a call into a plug-in: its value, or what went wrong and whose it was. */
export type PluginResult<T> = { ok: true; value: T } | { ok: false; plugin: string; message: string };

/** The ways a registry calls into its plug-ins, and the plug-ins it stopped, each with why. */
export interface PluginCalls {
  /** The answer of `call`, made by `plugin`'s `what`, timed, caught and named. */
  guarded: <T>(plugin: string, what: string, call: () => T) => PluginResult<T>;
  /** As `guarded`, for a call whose answer may come later. */
  awaited: <T>(plugin: string, what: string, call: () => T | Promise<T>) => Promise<PluginResult<T>>;
  stopped: Map<string, string>;
}

/** Calls timed by `now`, each allowed `timeLimit` milliseconds. */
export function pluginCalls(now: () => number, timeLimit: number): PluginCalls {
  const stopped = new Map<string, string>();
  const notRun = (plugin: string, what: string): PluginResult<never> | null => {
    const stop = stopped.get(plugin);
    return stop === undefined ? null : { ok: false, plugin, message: `${what} of ${plugin} was not run: ${stop}` };
  };
  const failed = (plugin: string, what: string, err: unknown): PluginResult<never> => {
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, plugin, message: `${what} of ${plugin} failed: ${why}` };
  };
  /** The value of a call begun at `start`, or, when it ran over the limit, why its plug-in was stopped. */
  const timed = <T>(plugin: string, what: string, start: number, value: T): PluginResult<T> => {
    const took = now() - start;
    if (took <= timeLimit) return { ok: true, value };
    const why = `the plug-in was stopped, as ${what} took ${Math.round(took)} ms, over the ${timeLimit} ms allowed`;
    stopped.set(plugin, why);
    return { ok: false, plugin, message: `${what} of ${plugin} ran too long: ${why}.` };
  };
  return {
    guarded(plugin, what, call) {
      const no = notRun(plugin, what);
      if (no) return no;
      const start = now();
      try {
        return timed(plugin, what, start, call());
      } catch (err) {
        return failed(plugin, what, err);
      }
    },
    async awaited(plugin, what, call) {
      const no = notRun(plugin, what);
      if (no) return no;
      const start = now();
      try {
        return timed(plugin, what, start, await call());
      } catch (err) {
        return failed(plugin, what, err);
      }
    },
    stopped,
  };
}
