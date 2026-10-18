// A graph's source read through the vault (editor spec §20 gql_file_source, gql_file_missing; §7 view_of_another_note):
// the .gql file or note a FROM block names, found as Obsidian finds a link from the note, read where it is written and
// never copied, and handed to the core to read as a note's own blocks are read. What is not there is looked for by its
// name elsewhere in the vault, so a moved file is said to be moved; one that cannot be read is said with its reason.
// And a card drawn from a source is drawn again whenever that source changes, moves, or comes back.
import { MarkdownRenderChild, TFile } from 'obsidian';
import type { MarkdownPostProcessorContext, TAbstractFile } from 'obsidian';
import { namesSharedSchema, READ_LIMITS, readSource } from '@thoughtknot/core';
import type { GraphSource, SourceFetched, SourceRead, SourceRefusal } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';

/** The last part of a place: the file's name, a note's with `.md` when its link leaves it off. */
function nameOf(source: GraphSource): string {
  const last = source.target.split('/').at(-1) ?? '';
  return source.kind === 'note' && !/\.md$/i.test(last) ? `${last}.md` : last;
}

/** The file a source names, found as a link from the note at `from` is found, else by its path from the vault's root. */
function fileOf(plugin: ThoughtKnotPlugin, source: GraphSource, from: string): TFile | null {
  const { vault, metadataCache } = plugin.app;
  const linked = metadataCache.getFirstLinkpathDest(source.target, from);
  if (linked instanceof TFile) return linked;
  for (const path of [source.target, source.kind === 'note' ? `${source.target}.md` : null]) {
    const f = path ? vault.getAbstractFileByPath(path) : null;
    if (f instanceof TFile) return f;
  }
  return null;
}

/** What the vault holds at a source's place: its text, why it cannot be read, or that it is missing and where its name is. */
async function lookUp(plugin: ThoughtKnotPlugin, source: GraphSource, from: string): Promise<SourceFetched> {
  const file = fileOf(plugin, source, from);
  if (!file) {
    const name = nameOf(source);
    const elsewhere = plugin.app.vault
      .getFiles()
      .filter((f) => f.name === name)
      .map((f) => f.path);
    return { missing: true, elsewhere };
  }
  // a .gql file over the bytes a note's graph blocks may hold is never read, by the size the vault keeps for it (§9); a
  // note is read, as Obsidian reads it, and only its graph blocks are held to the limits
  if (source.kind === 'file' && file.stat.size > READ_LIMITS.bytes)
    return { found: file.path, tooLarge: file.stat.size };
  try {
    return { found: file.path, text: await plugin.app.vault.cachedRead(file) };
  } catch (e) {
    return { found: file.path, unreadable: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * A source read for the note at `from`: what the core makes of the text the vault holds there (the vault's shared
 * schemas given when its blocks name one), or why it cannot be drawn, naming it.
 */
export async function readFromVault(
  plugin: ThoughtKnotPlugin,
  source: GraphSource,
  from: string,
): Promise<SourceRead | SourceRefusal> {
  const held = await lookUp(plugin, source, from);
  const read = readSource(source, held);
  if ('refused' in read || !read.texts.some(namesSharedSchema)) return read;
  return readSource(source, held, await plugin.sharedSchemas());
}

/**
 * Draws a card again (`redraw`) whenever its source changes: the file it was read from modified, or anything of the
 * source's name made, moved or deleted, so a missing source that comes back, or one moved away, is said at once. The
 * listeners go with the card's own drawing (`ctx`), so a card drawn again never listens twice.
 */
export function watchSource(
  plugin: ThoughtKnotPlugin,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  source: GraphSource,
  read: SourceRead | SourceRefusal,
  redraw?: () => void,
): void {
  if (!redraw) return;
  const name = nameOf(source),
    found = 'from' in read ? read.from : null;
  const watcher = new MarkdownRenderChild(el);
  const ours = (f: TAbstractFile, old?: string) =>
    f.path === found || old === found || f.name === name || (old?.split('/').at(-1) ?? '') === name;
  // drawn again once the vault has told every listener: a redraw takes this card's listeners away, which must not
  // happen while the vault is still telling the other cards
  const again = () => void Promise.resolve().then(redraw);
  const vault = plugin.app.vault;
  watcher.registerEvent(vault.on('modify', (f) => f.path === found && again()));
  watcher.registerEvent(vault.on('create', (f) => ours(f) && again()));
  watcher.registerEvent(vault.on('delete', (f) => ours(f) && again()));
  watcher.registerEvent(vault.on('rename', (f, old) => ours(f, old) && again()));
  ctx.addChild(watcher);
}
