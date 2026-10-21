// Sending to an AI model (editor spec §19): the one way anything leaves the editor for an AI, host-free. Nothing is
// sent while AI is off (ai_off_until_chosen). `prepareSend` makes the exact request for what the user chose
// (user_chooses_what). It refuses one above the model's ceiling, at the highest classification, or holding a credential
// (never_above_ceiling, never_credential). The user is shown it whole (seen_before_sent). `confirmSend` is their yes to
// exactly that, good for one send only (never_in_background). `sendPrepared` sends it through the transport the host
// hands in; the core itself reaches no network. It puts the key in only as it goes (keys_kept_secret). It records the
// send whatever comes of it (record_every_send). It says plainly when the model cannot be reached or refuses
// (ai_unreachable). It gives an answer back as a proposal, never an edit (answers_are_proposals). A model may name an AI
// provider a plug-in adds (plugin-ai.ts, trust_ai_provider_bounded). It only shapes the body and reads the reply; all
// else here holds as for any model.
import { proposalFrom } from './ai-answer.ts';
import { clearance, credentialsIn, levelSaid } from './ai-ceiling.ts';
import { aiReady, endpointProblem } from './ai-choice.ts';
import { sha256, utf8Size } from './ai-digest.ts';
import { INSTRUCTIONS, askedText, changesIn, readReply, requestBody } from './ai-request.ts';
import { keyHeader } from './plugin-ai.ts';
import type { AiProvider } from './plugin-ai.ts';
import type { MatrixRow } from './ai-matrix.ts';
import { aiScope } from './ai-scope.ts';
import type { ScopeChoice } from './ai-scope.ts';
import { formatList } from './locale-formats.ts';
import { basisOf } from './proposals-basis.ts';
import type { Proposal } from './proposals.ts';
import type { AiModel, Settings } from './settings.ts';
import { word } from './words.ts';

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
  /** The rows of the vault's destination matrix, as the host read them; a model with a row picked is held to its row. */
  matrix?: MatrixRow[];
  /** The AI provider the model names, as the host's plug-ins give it (`aiProvider`); none for the one wire format. */
  provider?: AiProvider;
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
  /** What was chosen, as the record keeps it: its kind and how many things and links, never their names. */
  scope: SendScope;
  /** The state of the graph sent: a proposal from the answer is made against it. */
  basis: string;
  /** The AI provider that shaped the body and reads the reply, when the model names one. */
  provider?: AiProvider;
}

/** What a send held, as its record keeps it: the kind of choice and the counts. */
export interface SendScope {
  kind: 'whole' | 'view' | 'ticked';
  things: number;
  links: number;
}

/** A send refused before anything went: why, and the models cleared for the note when the ceiling was the reason. */
export interface SendRefused {
  refused: string;
  cleared?: string[];
}

/**
 * The record of one send, kept by the host. It is never the text sent, only its SHA-256 digest and size, and its scope.
 * It holds the model's name and address, when, and what came of it. The proposal from it names its `id`.
 */
export interface SendRecord {
  id: string;
  at: string;
  model: string;
  to: string;
  digest: string;
  size: number;
  scope: SendScope;
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
  const found = settings.aiModels.find((m) => m.name === ask.model);
  if (!found) return { refused: word('ai.send.no-model', { model: ask.model }) };
  // a copy, so what is shown, said yes to and sent stays as it was shown whatever the settings do meanwhile
  const model = { ...found };
  const address = endpointProblem(model.endpoint);
  if (address) return { refused: word('ai.send.address', { model: model.name, why: address }) };
  if (!model.model.trim()) return { refused: word('ai.send.no-model-name', { model: model.name }) };
  const matrix = { rows: ask.matrix ?? [], classMap: settings.aiClassMap };
  const cleared = clearance(ask.level, model, settings.classifications, ready.ready, settings.aiUnlabelled, matrix);
  if ('refused' in cleared) return cleared;
  const provider = model.provider ? ask.provider : undefined;
  if (model.provider && provider?.name !== model.provider)
    return { refused: word('ai.send.no-provider', { model: model.name, provider: model.provider }) };
  const scope = aiScope(ask.note, ask.choice, ask.shared);
  if ('refused' in scope) return scope;
  let body: string;
  try {
    const asked = askedText(scope, ask.question);
    body = provider
      ? provider.shape({ model: model.model, instructions: INSTRUCTIONS, asked })
      : requestBody(model, scope, ask.question);
  } catch (e) {
    return { refused: e instanceof Error ? e.message : String(e) };
  }
  // everything that goes is looked over as written, before it is put in the request. That is the address, and the whole
  // message (the graph's name, what was chosen in words, its GQL and the question). The body a provider shaped is
  // looked over too, as it may add to what it was given
  const held = credentialsIn(`${model.endpoint}\n${askedText(scope, ask.question)}\n${body}`, ask.secrets);
  if (held.length) return { refused: word('ai.send.credential', { held: formatList(held) }) };
  const at = { model: model.name, name: model.model, address: model.endpoint.trim() };
  return {
    model,
    to: model.endpoint.trim(),
    body,
    headersShown: {
      'Content-Type': 'application/json',
      ...(model.keyName
        ? Object.fromEntries([keyHeader(provider, word('ai.send.key-shown', { key: model.keyName }))])
        : {}),
    },
    summary: [
      model.matrixRow
        ? word('ai.summary.to-row', { ...at, row: model.matrixRow })
        : word('ai.summary.to-ceiling', { ...at, ceiling: model.ceiling }),
      model.keyName ? word('ai.summary.key', { key: model.keyName }) : word('ai.summary.no-key'),
      word('ai.summary.from', {
        path: ask.notePath,
        level: ask.level?.trim() ? levelSaid(ask.level, false) : levelSaid(settings.aiUnlabelled, true),
      }),
      word('ai.summary.what', { said: scope.shown }),
    ],
    note: ask.notePath,
    level: ask.level,
    graph: scope.graph,
    said: scope.said,
    scope: { kind: scope.kind, things: scope.things.length, links: scope.links },
    basis: basisOf(ask.note, scope.graph, ask.shared),
    ...(provider && { provider }),
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
 * Sends a prepared request, once the user has said yes to exactly it, through the host's transport. It gives back what
 * came of it with its record. Some sends are refused before anything goes: one with no yes, or a yes to something else
 * or already used. So is one to a model whose key is not in the secret store. The key is put in the request's header
 * only as it is sent, and taken out of anything said.
 */
export async function sendPrepared(
  p: PreparedSend,
  yes: Confirmation | undefined,
  deps: SendDeps,
): Promise<SendResult> {
  const meant = yes ? given.get(yes) : undefined;
  if (!yes || meant === undefined) return { refused: word('ai.send.no-yes') };
  if (meant !== exactly(p)) return { refused: word('ai.send.changed') };
  if (p.model.keyName && !deps.key)
    return { refused: word('ai.send.no-key', { key: p.model.keyName, model: p.model.name }) };
  given.delete(yes);
  const key = p.model.keyName ? deps.key : null;
  const hide = (s: string) => (key ? s.split(key).join(word('ai.send.hidden-key')) : s);
  const at = (deps.now ?? (() => new Date()))()
    .toISOString()
    .replace(/\.\d+Z$/, 'Z');
  const record: SendRecord = {
    id: `ai-${at.replace(/[-:]/g, '')}`,
    at,
    model: p.model.name,
    to: p.to,
    digest: sha256(p.body),
    size: utf8Size(p.body),
    scope: { ...p.scope },
    outcome: 'failed',
  };
  const failed = (why: string): SendResult => {
    const said = word('ai.send.failed', { why: hide(why) });
    return { record: { ...record, why: said }, failed: said };
  };
  let reply: TransportReply;
  try {
    reply = await deps.transport({
      url: p.to,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? Object.fromEntries([keyHeader(p.provider, key)]) : {}) },
      body: p.body,
    });
  } catch (e) {
    // the key is taken out before the message is cut short, so no part of it is left to say
    const said = hide(e instanceof Error ? e.message : String(e));
    const why = said.length > 200 ? `${said.slice(0, 200)}…` : said;
    return failed(word('ai.send.unreachable', { model: p.model.name, address: p.to, why }));
  }
  let read;
  try {
    read = p.provider
      ? p.provider.read({ status: reply.status, text: hide(reply.text) })
      : readReply(reply.status, hide(reply.text));
  } catch (e) {
    return failed(hide(e instanceof Error ? e.message : String(e)));
  }
  if ('refused' in read) return failed(word('ai.send.refused', { model: p.model.name, why: read.refused }));
  const changes = 'content' in read ? changesIn(read.content) : read;
  const cannot = (why: string) => failed(word('ai.send.unread', { model: p.model.name, why }));
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
