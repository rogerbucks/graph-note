// The core's own AI wire format as a plug-in (editor spec §43, plugin_interface). A model that names no provider is
// sent in the one format the core has. That provider shapes the request and reads the reply, as any plug-in's does.
// It sits apart from ai.ts, so the send reads it through the interface without a cycle.
import { chatBody, readReply } from './ai-request.ts';
import { pluginRegistry, PLUGIN_API } from './plugins.ts';
import type { PluginRegistry, ThoughtKnotPlugin } from './plugins.ts';
import type { AiProvider } from './plugin-ai.ts';
import { word } from './words.ts';

/** The name of the core's own provider, which a model with no provider named is sent through. */
export const CORE_AI_PROVIDER = 'chat-completions';

/**
 * The core's own AI provider, added through the plug-in interface as any plug-in's is (plugin_interface). It is the
 * chat completions shape, with the key in an Authorization header as a bearer token. Its title is said in the reader's
 * language as it is added.
 */
export const CORE_AI: ThoughtKnotPlugin = {
  id: 'thoughtknot.ai',
  version: '1.0.0',
  api: PLUGIN_API,
  uses: ['ai'],
  register: (points) =>
    points.ai?.add({
      name: CORE_AI_PROVIDER,
      title: word('plugins.ai.chat-completions'),
      key: { header: 'Authorization', format: 'Bearer {key}' },
      shape: ({ model, instructions, asked }) => chatBody(model, instructions, asked),
      read: ({ status, text }) => readReply(status, text),
    }),
};

let held: PluginRegistry | undefined;

/**
 * The core's own AI provider as the registry gives it, each call into it timed, caught and named. Made when first
 * asked for and kept, as the core's own exports are; it is trusted to finish, so no time limit stops it.
 */
export function coreAiProvider(): AiProvider {
  if (!held) {
    held = pluginRegistry({ timeLimit: Infinity });
    held.register(CORE_AI);
  }
  const provider = held.aiProvider(CORE_AI_PROVIDER);
  if (!provider) throw new Error(word('plugins.none.provider', { name: CORE_AI_PROVIDER }));
  return provider;
}
