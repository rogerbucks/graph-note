// Sending to an AI model (editor spec §19): the one way anything leaves the editor for an AI, host-free. Nothing is sent
// while AI is off (ai_off_until_chosen). `prepareSend` makes the exact request for what the user chose (user_chooses_what)
// and refuses one above the model's ceiling, at the highest classification, or holding a credential (never_above_ceiling,
// never_credential); the user is shown it whole (seen_before_sent), and `confirmSend` is their yes to exactly that, good
// for one send only (never_in_background). `sendPrepared` sends it through the transport the host hands in — the core
// itself reaches no network — with the key put in only as it goes (keys_kept_secret), records the send whatever comes
// of it (record_every_send), says plainly when the model cannot be reached or refuses (ai_unreachable), and gives an
// answer back as a proposal, never an edit (answers_are_proposals).
import { proposalFrom } from './ai-answer.ts';
import { clearance, credentialsIn } from './ai-ceiling.ts';
import { aiReady, endpointProblem } from './ai-choice.ts';
import { changesIn, readReply, requestBody } from './ai-request.ts';
import { aiScope } from './ai-scope.ts';
import type { ScopeChoice } from './ai-scope.ts';
import { basisOf } from './proposals-basis.ts';
import type { Proposal } from './proposals.ts';
import type { AiModel, Settings } from './settings.ts';

export { aiReady } from './ai-choice.ts';

/** A request as the host's transport sends it: the only thing that reaches the network, and only when the user sends. */
export interface TransportRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

/** What came back: the status and the body as text. */
export interface TransportReply {
  status: number;
  text: string;
}

/** The host's way to send a request: it throws when the model cannot be reached. */
export type Transport = (request: TransportRequest) => Promise<TransportReply>;

/** What a send is asked for: the settings, the model by name, the note and what of it, and the question. */
export interface SendAsk {
  settings: Settings;
  model: string;
  /** The note's text, and its path in the vault. */
  note: string;
  notePath: string;
  /** The note's classification as the host read it; null when it has none. */
  level: string | null;
  choice: ScopeChoice;
  question: string;
  /** Texts never to be sent, such as the model's own key: looked for, never kept. */
  secrets?: readonly string[];
  /** The vault's shared schemas, for reading the note. */
  shared?: string[];
}

/** A send made ready: everything that will go, and where, for the user to see before saying yes. */
export interface PreparedSend {
  model: AiModel;
  /** The address it goes to. */
  to: string;
  /** The body, exactly as it is sent. */
  body: string;
  /** The headers as sent, a key shown only by its name in the secret store. */
  headersShown: Record<string, string>;
  /** What the user is told with it: the model, the address, the note, its classification and what was chosen. */
  summary: string[];
  note: string;
  /** The note's classification as the host read it; null when it has none. */
  level: string | null;
  graph: string;
  said: string;
  /** The state of the graph sent: a proposal from the answer is made against it. */
  basis: string;
}

/** A send refused before anything went: why, and the models cleared for the note when the ceiling was the reason. */
export interface SendRefused {
  refused: string;
  cleared?: string[];
}

/** The record of one send, kept by the host: what was sent, to which model and where, when, and what came of it. */
export interface SendRecord {
  id: string;
  at: string;
  model: string;
  modelId: string;
  to: string;
  note: string;
  graph: string;
  what: string;
  level: string | null;
  sent: string;
  outcome: 'answered' | 'failed';
  why?: string;
}

/** What came of a send: a proposal, or why there is none (the send recorded either way); or refused before it went. */
export type SendResult =
  { record: SendRecord; proposal: Proposal } | { record: SendRecord; failed: string } | { refused: string };

/** The user's yes to one prepared send: only `confirmSend` makes one, and it is good for one send of exactly that. */
export interface Confirmation {
  readonly of: string;
}

// each yes given, by what it is a yes to: taken away as it is used
const given = new WeakMap<Confirmation, string>();
const exactly = (p: PreparedSend) => JSON.stringify([p.model.name, p.to, p.body]);

/** The exact request for what the user chose, ready to be shown; or why nothing may be sent. */
export function prepareSend(ask: SendAsk): PreparedSend | SendRefused {
  const { settings } = ask;
  const ready = aiReady(settings);
  if ('off' in ready) return { refused: ready.off };
  const model = settings.aiModels.find((m) => m.name === ask.model);
  if (!model) return { refused: `No model named ${ask.model} is set up.` };
  const address = endpointProblem(model.endpoint);
  if (address) return { refused: `${model.name} cannot be sent to: ${address}` };
  if (!model.model.trim()) return { refused: `${model.name} names no model: set it in the model’s settings.` };
  const cleared = clearance(ask.level, model, settings.classifications, ready.ready);
  if ('refused' in cleared) return cleared;
  const scope = aiScope(ask.note, ask.choice, ask.shared);
  if ('refused' in scope) return scope;
  const found = credentialsIn(`${scope.gql}\n${ask.question}`, ask.secrets);
  if (found.length)
    return {
      refused: `What would be sent holds what looks like ${found.join(' and ')}, so nothing is sent. Leave out what holds it, or take it out of the note.`,
    };
  const levels = settings.classifications;
  const level =
    ask.level === null
      ? `It has no classification, so it is taken as ${levels[0]}, the lowest.`
      : `It is classified ${ask.level}.`;
  return {
    model,
    to: model.endpoint.trim(),
    body: requestBody(model, scope, ask.question),
    headersShown: {
      'Content-Type': 'application/json',
      ...(model.keyName ? { Authorization: `Bearer (the key named ${model.keyName} in the app’s secret store)` } : {}),
    },
    summary: [
      `To ${model.name} (${model.model}), at ${model.endpoint.trim()}, whose ceiling is ${model.ceiling}.`,
      `From ${ask.notePath}. ${level}`,
      `What is sent: ${scope.said}, and your question.`,
    ],
    note: ask.notePath,
    level: ask.level,
    graph: scope.graph,
    said: scope.said,
    basis: basisOf(ask.note, scope.graph, ask.shared),
  };
}

/** The user's yes to exactly this send, once they have seen it: good for one send. */
export function confirmSend(p: PreparedSend): Confirmation {
  const yes: Confirmation = Object.freeze({ of: p.body });
  given.set(yes, exactly(p));
  return yes;
}

/** What the host hands a send: its transport, the model's key from its secret store (null if it has none), and a clock. */
export interface SendDeps {
  transport: Transport;
  key: string | null;
  now?: () => Date;
}

/**
 * Sends a prepared request, once the user has said yes to exactly it, through the host's transport, and gives back what
 * came of it with its record. A send with no yes, a yes to something else or already used, or a model whose key is not in
 * the secret store is refused before anything goes. The key is put in the request's header only as it is sent, and
 * taken out of anything said.
 */
export async function sendPrepared(
  p: PreparedSend,
  yes: Confirmation | undefined,
  deps: SendDeps,
): Promise<SendResult> {
  const meant = yes ? given.get(yes) : undefined;
  if (!yes || meant === undefined)
    return {
      refused:
        'Nothing was sent: it is sent only when you say yes to exactly what you were shown, and a yes is used once, never again.',
    };
  if (meant !== exactly(p))
    return { refused: 'Nothing was sent: what would be sent is not what you said yes to. Look at it again.' };
  if (p.model.keyName && !deps.key)
    return {
      refused: `Nothing was sent: the key named ${p.model.keyName} is not in the app’s secret store. Choose it again in ${p.model.name}’s settings.`,
    };
  given.delete(yes);
  const key = p.model.keyName ? deps.key : null;
  const hide = (s: string) => (key ? s.split(key).join('[the key]') : s);
  const at = (deps.now ?? (() => new Date()))()
    .toISOString()
    .replace(/\.\d+Z$/, 'Z');
  const record: SendRecord = {
    id: `ai-${at.replace(/[-:]/g, '')}`,
    at,
    model: p.model.name,
    modelId: p.model.model,
    to: p.to,
    note: p.note,
    graph: p.graph,
    what: p.said,
    level: p.level,
    sent: p.body,
    outcome: 'failed',
  };
  const failed = (why: string): SendResult => {
    const said = `${hide(why)} Nothing was changed.`;
    return { record: { ...record, why: said }, failed: said };
  };
  let reply: TransportReply;
  try {
    reply = await deps.transport({
      url: p.to,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: p.body,
    });
  } catch (e) {
    return failed(`${p.model.name} could not be reached at ${p.to} (${e instanceof Error ? e.message : String(e)}).`);
  }
  const read = readReply(reply.status, reply.text);
  if ('refused' in read) return failed(`${p.model.name} refused the request (${read.refused}).`);
  const changes = 'content' in read ? changesIn(read.content) : read;
  const cannot = (why: string) =>
    failed(`${p.model.name} answered, but not with changes this editor can read: ${why}.`);
  if (!Array.isArray(changes)) return cannot(changes.unread);
  const proposal = proposalFrom(changes, {
    id: record.id,
    at,
    model: p.model.name,
    graph: p.graph,
    said: p.said,
    basis: p.basis,
  });
  if ('refused' in proposal) return cannot(proposal.refused);
  return { record: { ...record, outcome: 'answered' }, proposal };
}
