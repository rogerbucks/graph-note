// AI providers a plug-in adds (editor spec §43, plugin_interface; §54, trust_ai_provider_bounded). A provider turns
// the core's request into its service's shape, and reads the reply. Nothing else:
// - it is given the model's id, the instructions and the asked text, with the note's graph fenced (AI-3). It is never
//   given the key, the notes or a way to send;
// - the core keeps the gate, the ceiling, the fence and the credential check (ai.ts). The person sees the exact text it
//   shaped, and their yes is bound to it;
// - it names where the key goes, such as a header. The host puts the key there and sends, so B7 stays the one way out;
// - the answer it reads is checked as any answer is (AI-4).

/** What a provider is given to shape: the model's id, the instructions, and the asked text. */
export interface ProviderRequest {
  model: string;
  instructions: string;
  asked: string;
}

/** What a provider reads from a reply: the model's answer as text, or why there is none. */
export type ProviderReading = { content: string } | { refused: string } | { unread: string };

/** An AI service a plug-in adds, such as one with its own request shape. */
export interface AiProvider {
  /** The word a model names it by, lower case: `echo`. */
  name: string;
  /** What it is called where it is offered, in the host's language. */
  title: string;
  /** Where the key goes: a header, and how it is written there, with `{key}` where the key goes. `Authorization: Bearer {key}` unless set. */
  key?: { header: string; format?: string };
  /** The body sent, as the exact text. */
  shape: (request: ProviderRequest) => string;
  /** The answer in a reply, given its status and its text. */
  read: (reply: { status: number; text: string }) => ProviderReading;
}

/** Headers the host sets itself, or that would send the key somewhere else; a provider may not put the key in one. */
const HOST_HEADERS = ['host', 'content-length', 'content-type', 'cookie', 'origin', 'referer', 'transfer-encoding'];

/** Why an AI provider a plug-in adds is refused, or null when it is accepted. */
export function providerProblem(p: AiProvider, taken: Map<string, string>): string | null {
  if (!/^[a-z][a-z0-9-]*$/.test(p.name)) return `the AI provider "${p.name}" is not named by a lower-case word`;
  if (taken.has(p.name)) return `the AI provider "${p.name}" is already added by ${taken.get(p.name)}`;
  if (!p.title.trim()) return `the AI provider "${p.name}" has no title`;
  if (typeof p.shape !== 'function') return `the AI provider "${p.name}" shapes no request`;
  if (typeof p.read !== 'function') return `the AI provider "${p.name}" reads no reply`;
  if (p.key) {
    const { header, format = '{key}' } = p.key;
    if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(header) || HOST_HEADERS.includes(header.toLowerCase()))
      return `the AI provider "${p.name}" cannot put the key in the header "${header}"`;
    if (format.split('{key}').length !== 2 || /[\r\n]/.test(format))
      return `the AI provider "${p.name}" writes the key with {key} once, on one line`;
  }
  return null;
}

/** The header a key goes in, and its value with the key written in: `Authorization: Bearer …` unless a provider says. */
export function keyHeader(provider: AiProvider | undefined, key: string): [string, string] {
  const { header, format = '{key}' } = provider?.key ?? { header: 'Authorization', format: 'Bearer {key}' };
  return [header, format.replace('{key}', () => key)];
}

/** How a registry calls into a plug-in: timed, caught and named (plugin-calls.ts). */
type Guarded = <T>(
  plugin: string,
  what: string,
  call: () => T,
) => { ok: true; value: T } | { ok: false; message: string };

/**
 * Provider `p` of `plugin`, as the core calls it: each call timed, caught and named, a wrong answer named, and what it
 * is given frozen. A call that fails throws, saying whose it was, so a send stops there.
 */
export function guardedProvider(p: AiProvider, plugin: string, guarded: Guarded): AiProvider {
  const what = `The AI provider ${p.title}`;
  const sure = <T>(r: { ok: true; value: T } | { ok: false; message: string }): T => {
    if (!r.ok) throw new Error(r.message);
    return r.value;
  };
  return Object.freeze({
    ...p,
    key: p.key && Object.freeze({ ...p.key }),
    shape: (request: ProviderRequest) => {
      const body: unknown = sure(guarded(plugin, what, () => p.shape(Object.freeze({ ...request }))));
      if (typeof body !== 'string') throw new Error(`${what} of ${plugin} gave no request text.`);
      return body;
    },
    read: (reply: { status: number; text: string }) => {
      const r: unknown = sure(guarded(plugin, what, () => p.read(Object.freeze({ ...reply }))));
      const ok =
        !!r &&
        typeof r === 'object' &&
        (typeof (r as { content?: unknown }).content === 'string' ||
          typeof (r as { refused?: unknown }).refused === 'string' ||
          typeof (r as { unread?: unknown }).unread === 'string');
      if (!ok) throw new Error(`${what} of ${plugin} read no answer from the reply.`);
      return r as ProviderReading;
    },
  });
}
