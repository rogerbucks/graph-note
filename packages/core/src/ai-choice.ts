// Which AI may be asked (editor spec §19, ai_off_until_chosen, host_ai_first, user_models, models_by_purpose): none until
// the user turns AI on and sets up where requests go; the host's own AI first, where it has one, so the choices and
// consents made there apply; then the user's own models, each by its address, the one set up for the purpose first.
import type { AiModel, Settings } from './settings.ts';

/** The purposes a model may be set up for, as the spec names them; a model may be given any other. */
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

const LOCAL_HOSTS = /^(localhost|.+\.localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

/**
 * Why requests cannot go to `endpoint`, or null when they can: a model on this device by http or https, any other by
 * https only, so what is sent cannot be read on the way; and never an address holding a user name or a password, as a
 * key belongs in the secret store.
 */
export function endpointProblem(endpoint: string): string | null {
  const given = endpoint.trim();
  const example = 'such as http://localhost:11434/v1/chat/completions for a model on this device';
  if (!given) return `No address is set: give the address requests go to, ${example}.`;
  // read by hand, as the core has no URL of its own: a scheme, then the authority up to the path
  const parts = /^([a-z][a-z0-9+.-]*):\/\/([^/?#\s]+)([/?#]\S*)?$/i.exec(given);
  if (!parts) return `${given} is not an address: give the full address requests go to, ${example}.`;
  const scheme = (parts[1] ?? '').toLowerCase(),
    authority = parts[2] ?? '';
  if (scheme !== 'https' && scheme !== 'http')
    return `An address starts with https://, or http:// for a model on this device; ${given} does not.`;
  if (authority.includes('@'))
    return 'An address holds no user name or password: keep the key in the app’s secret store instead.';
  const host = authority.startsWith('[') ? authority.slice(0, authority.indexOf(']') + 1) : authority.split(':')[0];
  if (scheme === 'http' && !LOCAL_HOSTS.test(host ?? ''))
    return `A model on another machine is reached over https only, so what is sent cannot be read on the way: start ${given} with https://.`;
  return null;
}

/** Whether a model is set up enough to be asked: a name, a model and an address requests can go to. */
export const usable = (m: AiModel): boolean => !!m.name.trim() && !!m.model.trim() && !endpointProblem(m.endpoint);

/** Whether AI may be used: the models that may be asked, or why none may. */
export function aiReady(s: Settings): { ready: AiModel[] } | { off: string } {
  if (s.aiUse !== 'on')
    return { off: 'AI is off: turn on Use AI models in the settings, and set up a model, before anything is sent.' };
  const ready = s.aiModels.filter(usable);
  return ready.length
    ? { ready }
    : {
        off: 'No AI model is set up yet: set one up under AI models in the settings, with its name, model and address.',
      };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The AIs that may be asked for `purpose`, in the order they are offered: the host's own first, where it has one; then
 * the models set up for that purpose; then the rest. None while AI is off, the host's own among them.
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
