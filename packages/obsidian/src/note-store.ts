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
 * Shows a graph refused as too large to read at once as its overview, at the top of `card`, read in parts into the
 * store. The card's text and why are drawn first, so they show while it is read, and stay if it cannot be. Nothing is
 * shown for any other refusal.
 */
export async function overviewInParts(
  plugin: ThoughtKnotPlugin,
  card: HTMLElement,
  at: InParts,
  why: Refusal,
): Promise<void> {
  const over = 'limit' in why ? why.limit : undefined;
  if (over !== 'text-bytes' && over !== 'text-lines') return;
  const slot = card.createDiv();
  card.prepend(slot);
  // Obsidian does its own work between parts, so it keeps answering
  const pause = () => new Promise<void>((done) => window.setTimeout(done, 0));
  // a block shown on its own is kept apart from its note's other blocks, so they never take each other's place
  const [note, text] = at.note === undefined ? [`${at.path} · ${at.graph}`, fenced(at.source)] : [at.path, at.note];
  try {
    const stored = (await storedGraphs(storeOf(plugin), note, text, pause)).get(at.graph);
    if (stored) showStoredMassive(plugin, slot, at.graph, stored);
    else slot.remove();
  } catch (e) {
    slot.remove(); // the text and why are still there
    console.error('ThoughtKnot: a note could not be read in parts', e);
  }
}
