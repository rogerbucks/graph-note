// Reading view is read-only, strictly (spec §3, "Read-only in Reading view"; decided 9 Oct 2026, and held so after Roger's
// device check Z-09, 11 Oct 2026): the one check every write from a drawn card passes. Each control that writes reaches
// the note through the card's options — the editor open in place, which the inspector's rows, type menus and list chips,
// Park for later, a suggested name's fix, Record and Make a view all write through; Edit here, Done and Edit in pane; a
// view written by tapping; a view's Fade or Hide others and Save as shown — so the options are gated here, once. While
// the card is read-only each of them does nothing and gives nothing, so a control built on them offers nothing and
// writes nothing, and a direct call changes nothing. Every function in the options is gated, however deep it is held in
// objects and lists, but for the few named in READS as only reading: a new option that writes is closed by default. An
// option that holds functions this cannot reach, in an object of a class, is refused when the card is made, loudly.
import type { ViewOptions } from './view-options';

/** What a card shows, never a function or anything that writes: passed as it is. */
const DATA = [
  'source',
  'reading',
  'graph',
  'drawn',
  'problems',
  'mode',
  'completeness',
  'parked',
  'indent',
  'focusDepth',
] as const satisfies readonly (keyof ViewOptions)[];

/**
 * The functions that only read, show or leave, never change a note: open wherever the card is, each by its path in the
 * options. Of the export, only `run` is open: it writes a new file at a name no file has, never the note (spec §16,
 * vault-write.ts), and anything else an export is given later is gated like the rest. The View menu's switches change
 * the drawing alone, and lay it out again, never writing (§25, view_switch_view_only): open, the state held by its class.
 */
export const READS = ['lineOf', 'onClose', 'watchEditing', 'readOnly', 'exporting.run', 'switches'] as const;

const OPEN: ReadonlySet<string> = new Set<string>([...DATA, ...READS]);

type Fn = (...args: unknown[]) => unknown;

/** An object written as `{ … }`, or made with no prototype: never a Map, a list or a class's object. */
const plain = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Data the language gives, whose methods only read or change itself: a Map, a Set, a date, a pattern, bytes. */
const builtIn = (v: object): boolean =>
  v instanceof Map || v instanceof Set || v instanceof Date || v instanceof RegExp || ArrayBuffer.isView(v);

/**
 * Whether a Map or a Set holds something that writes among its keys and values, however deep in objects and lists they
 * hold it: a function, or an object of a class with methods.
 */
function holdsFunction(v: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof v === 'function') return true;
  if (typeof v !== 'object' || v === null || seen.has(v)) return false;
  seen.add(v);
  if (!Array.isArray(v) && !plain(v) && !builtIn(v) && hasMethods(v)) return true;
  const inside =
    v instanceof Map ? [...v.keys(), ...v.values()] : v instanceof Set || Array.isArray(v) ? [...v] : Object.values(v);
  return inside.some((x) => holdsFunction(x, seen));
}

/** The gated functions that were written `async`, so a gate over a gate still gives a promise. */
const ASYNC = new WeakSet<Fn>();

/** Whether an object has functions to call: its own, or its class's. */
function hasMethods(v: object): boolean {
  for (let p: object | null = v; p && p !== Object.prototype; p = Object.getPrototypeOf(p) as object | null)
    for (const name of Object.getOwnPropertyNames(p))
      if (name !== 'constructor' && typeof Object.getOwnPropertyDescriptor(p, name)?.value === 'function') return true;
  return false;
}

/**
 * The card's options with every write gated by `readOnly`, asked at each call, so it holds wherever the card is put and
 * however late. While it says so, a gated function does nothing: it returns undefined, or a promise of undefined when it
 * was written `async`; one that returns a promise without being written so gives undefined, which `await` and `void`
 * take as they would the promise. Otherwise it is called as it was, with its own `this`. Functions are found in objects
 * written as `{ … }` (with or without a prototype) and in lists, at any depth; an option outside DATA and READS that holds
 * an object of a class with methods throws here, since its writes could not be gated.
 */
export function gateWrites(o: ViewOptions, readOnly: () => boolean): ViewOptions {
  const closed = (f: Fn): Fn => {
    const isAsync = f.constructor.name === 'AsyncFunction' || ASYNC.has(f);
    const g = function gated(this: unknown, ...args: unknown[]): unknown {
      if (readOnly()) return isAsync ? Promise.resolve(undefined) : undefined;
      return f.apply(this, args);
    };
    if (isAsync) ASYNC.add(g);
    return g;
  };
  const copies = new WeakMap<object, unknown>();
  const gate = (v: unknown, path: string): unknown => {
    if (OPEN.has(path)) return v;
    if (typeof v === 'function') return closed(v as Fn);
    if (typeof v !== 'object' || v === null) return v;
    if (copies.has(v)) return copies.get(v);
    if (Array.isArray(v)) {
      const list: unknown[] = [];
      copies.set(v, list);
      v.forEach((x, i) => list.push(gate(x, `${path}[${i}]`)));
      return list;
    }
    if (plain(v)) {
      const copy = Object.create(Object.getPrototypeOf(v) as object | null) as Record<string, unknown>;
      copies.set(v, copy);
      for (const [k, x] of Object.entries(v)) copy[k] = gate(x, path ? `${path}.${k}` : k);
      return copy;
    }
    if ((v instanceof Map || v instanceof Set) && holdsFunction(v))
      throw new Error(
        `Graph Note: the card's option ${path} holds functions, or objects of a class with methods, in a Map or a Set, whose writes cannot be closed in reading view. Give them in a plain object, or name what only reads in READS (read-only.ts).`,
      );
    if (!builtIn(v) && hasMethods(v))
      throw new Error(
        `Graph Note: the card's option ${path} holds an object of a class with methods, whose writes cannot be closed in reading view. Give it as a plain object, or name what only reads in READS (read-only.ts).`,
      );
    return v;
  };
  return gate(o, '') as ViewOptions;
}
