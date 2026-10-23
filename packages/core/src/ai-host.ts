// The host's own AI (editor spec §19, host_ai_first). Where the host offers the AI models the user already uses, such
// as VS Code's language model API, the editor offers them first. So the choices and consents the user made there
// apply. Every other rule the core keeps for a model holds for these too:
// - AI stays off until the user turns it on;
// - the note's classification is held to a ceiling, and a credential is never sent;
// - the exact request is shown first, and the answer is a proposal.
// The host sends it through its own interface, never the network from here.
import { aiModel } from './ai-model.ts';
import type { AiModel } from './ai-model.ts';

/** One of the host's own models, as the host offers it. */
export interface HostModel {
  /** Its name, as the person picks it. */
  name: string;
  /** The model's id, as the host names it. */
  model: string;
  /** Where it goes, in words a person reads: the host's interface, never an address on the network. */
  address: string;
  /** The highest classification of note it may be sent. */
  ceiling: string;
}

/** `host` as a model the core's send takes: no key, since the host holds the sign-in, and no purpose. */
export const hostAiModel = (host: HostModel, classifications: string[]): AiModel =>
  aiModel({ name: host.name, model: host.model, endpoint: host.address, ceiling: host.ceiling }, classifications);
