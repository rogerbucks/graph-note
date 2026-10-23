// The local store of notes too big to read at once, in Obsidian (editor spec §53, scale_in_parts; way E, step 7). A
// card past the read limits reads its note into the store a part at a time, and is drawn as its overview from there.
// The store is kept in memory and built again on each load. A note gone or moved leaves it, and is read again when
// next drawn.
import { MeshIndex, memoryBackend, storedGraphs } from '@thoughtknot/core';
import type { Refusal } from '@thoughtknot/core';
import { showStoredMassive } from './massive-card';
import type ThoughtKnotPlugin from './main';

/** Each plugin's store, made the first time a card needs it. */
const stores = new WeakMap<ThoughtKnotPlugin, MeshIndex>();

/** The plugin's store, which follows notes as they are moved or deleted. */
function storeOf(plugin: ThoughtKnotPlugin): MeshIndex {
  const kept = stores.get(plugin);
  if (kept) return kept;
  const made = new MeshIndex(memoryBackend());
  plugin.registerEvent(plugin.app.vault.on('rename', (_, old) => made.remove(old)));
  plugin.registerEvent(plugin.app.vault.on('delete', (f) => made.remove(f.path)));
  stores.set(plugin, made);
  return made;
}

/** A block on its own, written as a note of one block, as the store reads notes. */
const fenced = (source: string): string => `\`\`\`gql\n${source}\n\`\`\`\n`;

/** Where a card's graph is: its note's path and text (none when Obsidian gives no section), its block and graph. */
export interface InParts {
  path: string;
  note: string | undefined;
  source: string;
  graph: string;
}

/**
 * Shows a graph refused as too large to read at once as its overview at the end of `card`, read in parts into the
 * store. Nothing is shown for any other refusal, or when the graph could not be read in parts.
 */
export async function overviewInParts(
  plugin: ThoughtKnotPlugin,
  card: HTMLElement,
  at: InParts,
  why: Refusal,
): Promise<void> {
  const over = 'limit' in why ? why.limit : undefined;
  if (over !== 'text-bytes' && over !== 'text-lines') return;
  // Obsidian does its own work between parts, so it keeps answering
  const pause = () => new Promise<void>((done) => window.setTimeout(done, 0));
  const stored = (await storedGraphs(storeOf(plugin), at.path, at.note ?? fenced(at.source), pause)).get(at.graph);
  if (stored) showStoredMassive(plugin, card, at.graph, stored);
}
