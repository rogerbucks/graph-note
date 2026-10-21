// Which AI may be asked (editor spec §19, ai_off_until_chosen, host_ai_first, user_models, models_by_purpose):
// - none until the user turns AI on and sets up where requests go;
// - the host's own AI first, where it has one, so the choices and consents made there apply;
// - then the user's own models, each by its address, the one set up for the purpose first.
import type { AiModel, Settings } from './settings.ts';
import { word } from './words.ts';

/**
 * The purposes a model may be set up for, as the spec names them; a model may be given any other. They are the values
 * a person types and the send dialog compares with, so they stay as the spec writes them.
 */
export const AI_PURPOSES = ['Research questions', 'Proposing changes', 'Restricted processing'];

/** The host's own AI, where the host has one: offered before any model set up here. */
export interface HostAi {
  name: string;
}

/** One AI that may be asked: the host's own, or a model set up here; and whether it is set up for the purpose asked. */
export interface ModelChoice {
  name: string;
  source: 'host' | 'settings';
  /** The model, for one set up here. */
  model?: AiModel;
  forPurpose: boolean;
}

// The WHATWG URL every host this core runs in has (Obsidian on desktop and phone, Node). It is declared here because
// the core is built without any host's library: only what is read of it.
declare const URL: new (input: string) => { protocol: string; hostname: string };

// this device, named exactly: never a name that only ends like one, such as evil.localhost
const LOCAL_HOSTS = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/;
// the characters a host and port are written in. Anything else (a backslash, a space, %, a letter outside ASCII) could
// make the request go somewhere other than the address seems to say
const AUTHORITY = /^[A-Za-z0-9.:[\]-]+$/;

/**
 * Why requests cannot go to `endpoint`, or null when they can. They can go to an address whose host is written plainly,
 * holding no user name, password, query string or fragment. A model on this device (localhost, 127.x.x.x or [::1],
 * exactly) may use http or https. Any other uses https only, so what is sent cannot be read on the way.
 */
export function endpointProblem(endpoint: string): string | null {
  const given = endpoint.trim();
  const example = 'http://localhost:11434/v1/chat/completions';
  if (!given) return word('ai.address.none', { example });
  const parts = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/is.exec(given);
  if (!parts) return word('ai.address.not-one', { given, example });
  const scheme = (parts[1] ?? '').toLowerCase(),
    rest = parts[2] ?? '';
  if (scheme !== 'https' && scheme !== 'http') return word('ai.address.scheme', { given });
  const authority = rest.split(/[/?#]/)[0] ?? '';
  const unclear = word('ai.address.unclear', { given });
  if (/[\\\s]/.test(authority)) return unclear;
  if (authority.includes('@')) return word('ai.address.user');
  if (!authority || !AUTHORITY.test(authority)) return unclear;
  if (/[?#]/.test(rest)) return word('ai.address.query');
  let hostname: string;
  try {
    hostname = new URL(given).hostname;
  } catch {
    return word('ai.address.not-one', { given, example });
  }
  if (scheme === 'http' && !LOCAL_HOSTS.test(hostname)) return word('ai.address.https', { given });
  return null;
}

/** Whether a model is set up enough to be asked: a name, a model and an address requests can go to. */
export const usable = (m: AiModel): boolean => !!m.name.trim() && !!m.model.trim() && !endpointProblem(m.endpoint);

/** Whether AI may be used: the models that may be asked, or why none may. */
export function aiReady(s: Settings): { ready: AiModel[] } | { off: string } {
  if (s.aiUse !== 'on') return { off: word('ai.off') };
  const ready = s.aiModels.filter(usable);
  return ready.length ? { ready } : { off: word('ai.no-model') };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The AIs that may be asked for `purpose`, in the order they are offered. The host's own comes first, where it has one;
 * then the models set up for that purpose; then the rest. None while AI is off, the host's own among them.
 */
export function modelChoices(s: Settings, purpose: string, hostAi: HostAi | null = null): ModelChoice[] {
  const ready = aiReady(s);
  if (!('ready' in ready)) return [];
  const mine = ready.ready.map((m) => ({
    name: m.name,
    source: 'settings' as const,
    model: m,
    forPurpose: same(m.purpose, purpose),
  }));
  return [
    ...(hostAi ? [{ name: hostAi.name, source: 'host' as const, forPurpose: true }] : []),
    ...mine.filter((c) => c.forPurpose),
    ...mine.filter((c) => !c.forPurpose),
  ];
}
