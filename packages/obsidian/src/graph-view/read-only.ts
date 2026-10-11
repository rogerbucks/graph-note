// Reading view is read-only, strictly (spec §3, "Read-only in Reading view"; decided 9 Oct 2026, and held so after Roger's
// device check Z-09, 11 Oct 2026): the one check every write from a drawn card passes. Each control that writes reaches
// the note through the card's options — the editor open in place, which the inspector's rows, type menus and list chips,
// Park for later, a suggested name's fix, Record and Make a view all write through; Edit here, Done and Edit in pane; a
// view written by tapping; a view's Fade or Hide others and Save as shown — so the options are gated here, once. While
// the card is read-only each of them does nothing and gives nothing, so a control built on them offers nothing and
// writes nothing, and a direct call changes nothing. Every function in the options is gated, and every function in an
// object they hold, but for the few named in READS as only reading: a new option that writes is closed by default.
import type { ViewOptions } from './view-options';

/**
 * The options that only read, show or leave, never change a note: open wherever the card is. Export is among them, since
 * it writes a new file and never the note (spec §16).
 */
export const READS = [
  'lineOf',
  'onClose',
  'watchEditing',
  'readOnly',
  'exporting',
] as const satisfies readonly (keyof ViewOptions)[];

type Fn = (...args: unknown[]) => unknown;

/** An object written as `{ … }`, as the options and a view's own options are; never a Map, an array or a class's. */
const plain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;

/**
 * The card's options with every write gated by `readOnly`, asked at each call, so it holds wherever the card is put and
 * however late: while it says so, a write does nothing and returns nothing. The editor open in place is then not there,
 * and so neither is any control that writes through it.
 */
export function gateWrites(o: ViewOptions, readOnly: () => boolean): ViewOptions {
  const gate = (v: unknown): unknown =>
    typeof v === 'function' ? (...args: unknown[]) => (readOnly() ? undefined : (v as Fn)(...args)) : v;
  const reads: readonly string[] = READS;
  const gated = Object.entries(o).map(([k, v]): [string, unknown] => {
    if (reads.includes(k)) return [k, v];
    // an object the options hold, such as a view's: its own writes are gated too
    if (plain(v) && Object.values(v).some((x) => typeof x === 'function'))
      return [k, Object.fromEntries(Object.entries(v).map(([n, x]) => [n, gate(x)]))];
    return [k, gate(v)];
  });
  return Object.fromEntries(gated) as unknown as ViewOptions;
}
