// The drawing holds no state (editor spec §36, drawing_holds_no_state). The SVG is a picture of the graph and nothing
// more: it stores no data and decides nothing. A tap, a double tap or a key on it is turned here into a graph command,
// which goes to the engine. The engine is the only part that talks to persistence, and the next drawing shows what it
// did.

/** What a person did on the drawing: the kind of event and the key of the thing it was on, if any. */
export interface DrawingEvent {
  type: 'click' | 'dblclick' | 'keydown';
  /** The key of the thing it was on, from the drawn box; null on the background. */
  key: string | null;
  /** For a key: which one. */
  keyName?: string;
}

/** A command to the graph, for the engine to carry out. */
export type GraphCommand =
  { op: 'select'; thing: string } | { op: 'open'; thing: string } | { op: 'clear' } | { op: 'remove'; thing: string };

/** Whoever carries out graph commands: the engine, and nothing in the drawing. */
export interface CommandSink {
  send(command: GraphCommand): void;
}

/** The graph command an event on the drawing asks for, or null when it asks for none. */
export function commandOf(event: DrawingEvent): GraphCommand | null {
  if (event.key === null) return event.type === 'click' ? { op: 'clear' } : null;
  if (event.type === 'click') return { op: 'select', thing: event.key };
  if (event.type === 'dblclick') return { op: 'open', thing: event.key };
  if (event.keyName === 'Enter') return { op: 'open', thing: event.key };
  if (event.keyName === 'Delete') return { op: 'remove', thing: event.key };
  return null;
}

/** Turns each event on the drawing into a command for the engine. It keeps nothing of its own between events. */
export function routeEvent(event: DrawingEvent, engine: CommandSink): GraphCommand | null {
  const command = commandOf(event);
  if (command) engine.send(command);
  return command;
}

// What an SVG may carry: the drawing's own marks and the key that names each box. Anything more would be data.
const DATA_ATTRIBUTE = /\sdata-(?!key=|kind=)[\w-]+=/g;
const HOLDS = [
  ['metadata', /<metadata[\s/>]/i],
  ['script', /<script[\s/>]/i],
  ['form field', /<(input|textarea|select)[\s/>]/i],
] as const;

/** What an SVG holds beyond a picture: data attributes, metadata, scripts or form fields. None for a plain drawing. */
export function stateInSvg(svg: string): string[] {
  const out: string[] = HOLDS.filter(([, re]) => re.test(svg)).map(([what]) => what);
  for (const m of svg.matchAll(DATA_ATTRIBUTE)) out.push(`attribute ${m[0].trim().slice(0, -1)}`);
  return out;
}
