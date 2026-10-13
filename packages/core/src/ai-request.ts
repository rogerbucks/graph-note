// The request an AI model is sent, and its answer read back (editor spec §19, seen_before_sent, answers_are_proposals):
// one wire format, the chat completions shape that local servers (Ollama, LM Studio, llama.cpp) and most remote services
// take, built here as the exact text sent, so what the user is shown is byte for byte what goes. The answer is read as
// changes only — things and links to add, a property to change, a thing or link to remove — never as an edit.
import type { AiScope } from './ai-scope.ts';
import { linkChange, thingChange, valueGql } from './proposals.ts';
import type { ChangeInput } from './proposals.ts';
import type { AiModel } from './settings.ts';

/** What a model is told it is for and how to answer: the first message of every request, shown with the rest. */
export const INSTRUCTIONS = [
  'You help edit a graph written in GQL in a note. You are shown the part of the graph the user chose, and their question.',
  'Answer with JSON only, and no other text: {"changes": [ ... ]}, each change one of these, its "reason" optional:',
  '{"op": "add-thing", "name": "a_name", "kind": "Kind", "properties": {"name": "Its text"}, "reason": "why"}',
  '{"op": "add-link", "from": "a_name", "type": "TYPE", "to": "b_name", "reason": "why"}',
  '{"op": "set", "thing": "a_name", "key": "property", "value": "a text, a number, true or false", "reason": "why"}',
  '{"op": "remove-thing", "thing": "a_name", "reason": "why"}',
  '{"op": "remove-link", "from": "a_name", "type": "TYPE", "to": "b_name", "reason": "why"}',
  'A name is one word of letters, digits and underscores. Nothing you propose is written until a person accepts it.',
].join('\n');

/** The user's message, as written before it is put in the request: what was chosen, in words and as GQL, and the question. */
export function askedText(scope: AiScope, question: string): string {
  return `Graph ${scope.graph}, ${scope.said}:\n\n${scope.gql}\n\nQuestion: ${question.trim()}`;
}

/** The body of the request, as the exact text sent: the model, the instructions, and what was chosen with the question. */
export function requestBody(model: AiModel, scope: AiScope, question: string): string {
  const asked = askedText(scope, question);
  return JSON.stringify(
    {
      model: model.model,
      messages: [
        { role: 'system', content: INSTRUCTIONS },
        { role: 'user', content: asked },
      ],
    },
    null,
    2,
  );
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const cut = (s: string) => (s.length > 200 ? `${s.slice(0, 200)}…` : s);

/** The message a reply's body gives, when it is JSON: an error's message, else nothing. */
function errorMessage(text: string): string {
  try {
    const body = JSON.parse(text) as unknown;
    const error = isRecord(body) ? body.error : undefined;
    if (isRecord(error) && typeof error.message === 'string') return error.message;
    if (typeof error === 'string') return error;
  } catch {
    // not JSON: the text itself is the message
  }
  return text.trim();
}

/** What a reply says: the model's answer as text, or why it is not one (a refusal by status, or no answer in it). */
export function readReply(
  status: number,
  text: string,
): { content: string } | { refused: string } | { unread: string } {
  if (status < 200 || status >= 300) {
    const said = cut(errorMessage(text));
    return { refused: `HTTP ${status}${said ? `: ${said}` : ''}` };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { unread: 'its reply is not JSON' };
  }
  const choice = isRecord(body) && Array.isArray(body.choices) ? (body.choices[0] as unknown) : undefined;
  const message = isRecord(choice) ? choice.message : undefined;
  const content = isRecord(message) ? message.content : undefined;
  return typeof content === 'string' ? { content } : { unread: 'its reply holds no message' };
}

// a name, a kind or a type is one word, so nothing else can ride in with it into the GQL written
const words = (c: Record<string, unknown>, ...keys: string[]) =>
  keys.every((k) => typeof c[k] === 'string' && /^[A-Za-z_]\w*$/.test(c[k]));

/** Properties the answer gives, each a text, a number or true or false; anything else is not one. */
function propertiesOf(v: unknown): Record<string, string | number | boolean> | null {
  if (v === undefined) return {};
  if (!isRecord(v)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, x] of Object.entries(v)) {
    if (!/^[A-Za-z_]\w*$/.test(k) || (typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean'))
      return null;
    out[k] = x;
  }
  return out;
}

/**
 * A model's words as plain text wherever they are rendered as Markdown (a `///` note is, from slice 4): each character
 * Markdown or HTML gives a meaning to is escaped with a backslash, so no reason can become an image, a link, emphasis,
 * a heading or HTML, and every word of it is still read.
 */
function plainText(s: string): string {
  // the slash and the at sign too, so an address in it is never made a link by itself
  return s.replace(/[\\`*_{}[\]()#+!|<>~&/@]/g, '\\$&');
}

/** One change the answer gives, as a proposal takes it; or why it is not one. */
function changeOf(c: unknown, n: number): ChangeInput | string {
  const at = `change ${n}`;
  if (!isRecord(c)) return `${at} is not an object`;
  const extra =
    typeof c.reason === 'string' && c.reason.trim() ? { reason: plainText(c.reason.trim().replace(/\s+/g, ' ')) } : {};
  const props = propertiesOf(c.properties);
  if (props === null) return `${at}: its properties are not each a one-word name with a text, a number, true or false`;
  switch (c.op) {
    case 'add-thing':
      return words(c, 'name', 'kind')
        ? thingChange(c.name as string, c.kind as string, props, extra)
        : `${at} lacks a one-word name or kind`;
    case 'add-link':
      return words(c, 'from', 'type', 'to')
        ? linkChange(c.from as string, c.type as string, c.to as string, props, extra)
        : `${at} lacks a one-word from, type or to`;
    case 'set': {
      const v = c.value;
      if (!words(c, 'thing', 'key') || (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean'))
        return `${at} lacks a one-word thing or property, or a value that is a text, a number, true or false`;
      return { op: 'set', thing: c.thing as string, key: c.key as string, value: valueGql(v), ...extra };
    }
    case 'remove-thing':
      return words(c, 'thing')
        ? { op: 'remove-thing', thing: c.thing as string, ...extra }
        : `${at} lacks a one-word thing`;
    case 'remove-link':
      return words(c, 'from', 'type', 'to')
        ? { op: 'remove-link', from: c.from as string, type: c.type as string, to: c.to as string, ...extra }
        : `${at} lacks a one-word from, type or to`;
    default:
      return `${at} is not one of the changes asked for (add-thing, add-link, set, remove-thing, remove-link)`;
  }
}

/**
 * The changes an answer proposes, read from the JSON in it (fenced or not); or why it cannot be read, in words, the whole
 * answer refused if one change cannot be, so nothing is taken from an answer only partly understood.
 */
export function changesIn(content: string): ChangeInput[] | { unread: string } {
  const from = content.indexOf('{'),
    to = content.lastIndexOf('}');
  if (from === -1 || to < from) return { unread: 'its answer holds no JSON' };
  let body: unknown;
  try {
    body = JSON.parse(content.slice(from, to + 1));
  } catch {
    return { unread: 'the JSON in its answer cannot be read' };
  }
  const list = isRecord(body) ? body.changes : undefined;
  if (!Array.isArray(list)) return { unread: 'its answer has no list of changes' };
  if (!list.length) return { unread: 'it proposed no changes' };
  const changes = list.map((c, i) => changeOf(c, i + 1));
  const fault = changes.find((c): c is string => typeof c === 'string');
  return fault ? { unread: fault } : (changes as ChangeInput[]);
}
