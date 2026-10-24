// The vault's own graph sources, added through the plug-in interface as any plug-in's are (editor spec §43,
// plugin_interface). A .gql file and a note are each a source of the built-in plug-in `thoughtknot.obsidian-sources`.
// Each reads the person's own vault, so a block that says FROM one still finds a moved or missing place and names it.
import { PLUGIN_API, pluginRegistry, word } from '@thoughtknot/core';
import type { GraphSource, PluginRegistry, SourceFetched, ThoughtKnotPlugin as CorePlugin } from '@thoughtknot/core';

/** The id of the built-in plug-in whose sources are the vault's own. */
export const OBSIDIAN_SOURCES_ID = 'thoughtknot.obsidian-sources';

/** What the vault holds at a place named by a block: the file or note `source` names, for the note at `from`. */
export type VaultFetch = (source: Pick<GraphSource, 'kind' | 'target'>, from: string) => Promise<SourceFetched>;

/** The built-in plug-in whose sources read a file and a note through `fetch`. */
export function vaultSources(fetch: VaultFetch): CorePlugin {
  return {
    id: OBSIDIAN_SOURCES_ID,
    version: '1.0.0',
    api: PLUGIN_API,
    uses: ['sources'],
    register: (points) => {
      for (const kind of ['file', 'note'] as const) {
        const here = (target: string, from: string) => fetch({ kind, target }, from);
        points.sources?.add({
          scheme: kind,
          title: word(`plugins.source.${kind}`),
          fetch: here,
          read: async (target) => {
            const found = await here(target, '');
            if ('text' in found) return { text: found.text };
            throw new Error(word('plugins.source.unread', { target }));
          },
        });
      }
    },
  };
}

/** A registry of the vault's sources, reading through `fetch`. */
export function vaultSourceRegistry(fetch: VaultFetch): PluginRegistry {
  const registry = pluginRegistry({ timeLimit: Infinity, builtIn: true });
  registry.register(vaultSources(fetch));
  return registry;
}
