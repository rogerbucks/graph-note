// The saved-layout cache (editor spec §53, scale_layout_cache; wiki/Massive-graphs-design.md, way E, step 3). A layout
// is saved as its marks, by a digest of what was laid out. So a graph or a group seen before opens without any layout,
// and an edit lays out again only the group it touched. A drawing that is panned, zoomed, resized or recoloured is
// never laid out again: none of these changes what is laid out.
//
// The cache is never the store (text_is_the_store). It can be thrown away at any time, and only costs a layout. A
// saved layout is read back through the same check a plug-in's marks pass (drawing-marks.ts). So a host's storage that
// was changed or broken gives a fresh layout, never a broken drawing.
//
// Host-free. It keeps the newest layouts in memory, up to a size. A host may give it a store of its own, such as the
// browser's storage or the local store, to keep layouts between sessions.
import { sha256 } from './ai-digest.ts';
import { drawMarksOf } from './drawing-marks.ts';
import type { DrawMark } from './drawing-marks.ts';
import type { DiagramSpace } from './plugin-diagrams.ts';

/**
 * The version of what is saved, part of every key. A change to how layouts are made or saved then makes every saved
 * layout a miss, never a wrong drawing. Raise it with any such change.
 */
export const LAYOUT_CACHE_VERSION = 1;

/** The most a cache keeps in memory by default, in characters of saved layouts: about 64 MB. */
export const LAYOUT_CACHE_MOST = 32_000_000;

/** A layout as saved: the space it needs and its marks. */
export interface SavedLayout {
  space: DiagramSpace;
  marks: DrawMark[];
}

/** A host's own store of saved layouts, by key. Each may fail or forget; the cache then lays out again. */
export interface LayoutStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, saved: string): Promise<void>;
}

/** SHA-256 of a text, as UTF-8, in sixty-four lowercase hexadecimal digits. A host may give its own, faster one. */
export type Digest = (text: string) => Promise<string>;

/** The core's own digest (ai-digest.ts). About 40 ms for 200 kB; a host's Web Crypto is several times faster. */
export const coreDigest: Digest = async (text) => sha256(text);

/**
 * The key a layout is saved by: a digest of what is laid out, such as a group's layout source, and the version. A
 * digest no one can match on purpose, so a note cannot be written to show another note's saved drawing. `digest` must
 * be SHA-256, so a key is the same whichever host made it.
 */
export async function layoutKey(source: string, digest: Digest = coreDigest): Promise<string> {
  return `layout:${LAYOUT_CACHE_VERSION}:${await digest(source)}`;
}

/** A saved layout read back, or null when it is not one: broken, changed, or of marks no drawing may hold. */
export function readSaved(text: string): SavedLayout | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { space, marks } = raw as { space?: unknown; marks?: unknown };
  if (typeof space !== 'object' || space === null) return null;
  const { width, height } = space as { width?: unknown; height?: unknown };
  if (typeof width !== 'number' || typeof height !== 'number' || !(width >= 0) || !(height >= 0)) return null;
  const checked = drawMarksOf(marks, { width, height });
  return typeof checked === 'string' ? null : { space: { width, height }, marks: checked };
}

/** The saved layouts: the newest in memory, up to `most` characters, and all in the host's store when it gives one. */
export class LayoutCache {
  private readonly memory = new Map<string, string>();
  private size = 0;
  private readonly store: LayoutStore | undefined;
  private readonly most: number;
  /** How many layouts were found saved, and how many were not. */
  readonly counts = { hits: 0, misses: 0 };

  constructor(store?: LayoutStore, most = LAYOUT_CACHE_MOST) {
    this.store = store;
    this.most = most;
  }

  /** The layout saved for `key`, or null when none is, or the one saved cannot be read back. */
  async get(key: string): Promise<SavedLayout | null> {
    let text = this.memory.get(key);
    if (text === undefined) text = await this.store?.get(key).catch(() => undefined);
    const saved = text === undefined ? null : readSaved(text);
    if (!saved || text === undefined) {
      this.counts.misses++;
      this.forget(key);
      return null;
    }
    this.counts.hits++;
    this.keep(key, text);
    return saved;
  }

  /** Saves `layout` for `key`, in memory and in the host's store. A store that fails is let be. */
  async set(key: string, layout: SavedLayout): Promise<void> {
    const text = JSON.stringify(layout);
    this.keep(key, text);
    await this.store?.set(key, text).catch(() => undefined);
  }

  /** The layout for `key`: the saved one, else `lay()`'s, which is then saved. */
  async layout(key: string, lay: () => Promise<SavedLayout>): Promise<SavedLayout> {
    const saved = await this.get(key);
    if (saved) return saved;
    const laid = await lay();
    await this.set(key, laid);
    return laid;
  }

  /** Everything in memory thrown away. The host's store keeps its own. */
  clear(): void {
    this.memory.clear();
    this.size = 0;
  }

  /** `text` kept in memory as the newest, and the oldest let go past the size. One larger than the size is not kept. */
  private keep(key: string, text: string): void {
    this.forget(key);
    if (text.length > this.most) return;
    this.memory.set(key, text);
    this.size += text.length;
    for (const [old, kept] of this.memory) {
      if (this.size <= this.most) break;
      this.memory.delete(old);
      this.size -= kept.length;
    }
  }

  private forget(key: string): void {
    const text = this.memory.get(key);
    if (text === undefined) return;
    this.memory.delete(key);
    this.size -= text.length;
  }
}
