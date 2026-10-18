// A block that holds only a schema, drawn as the schema itself (spec §3, schema_drawn): its kinds of thing as boxes and
// its relationship types as arrows between them, with the text one press of Source away. The card is read-only: the
// picture is not the note's text, so it never writes; the schema is changed in its text, as any block is.
import type { MarkdownPostProcessorContext } from 'obsidian';
import { gqlBlocks, namesSharedSchema, schemaPicture } from '@graph-note/core';
import type GraphNotePlugin from './main';
import { graphCard } from './graph-card';

/**
 * Draws `source` as its schema's picture where the note shows it, when it holds only a schema; resolves to whether it
 * did, so any other block, or one the picture cannot be laid out for, is drawn as a graph block always is.
 */
export async function renderSchemaBlock(
  plugin: GraphNotePlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  owner?: object,
): Promise<boolean> {
  const info = ctx.getSectionInfo(el);
  const blocks = info ? gqlBlocks(info.text) : [];
  const at = info ? blocks.findIndex((b) => b.line - 1 === info.lineStart) : -1;
  // shown on its own, as in a hover preview, when its place in the note is not known
  const texts = at < 0 ? [source] : blocks.map((b, i) => (i === at ? source : b.text));
  const shared = texts.some(namesSharedSchema) ? await plugin.sharedSchemas() : [];
  const picture = schemaPicture(texts, Math.max(at, 0), shared);
  const drawing = picture?.reading.graphs.get(picture.graph);
  if (!picture || !drawing?.boxes.length) return false;
  let drawn;
  try {
    drawn = await plugin.layout(drawing, owner);
  } catch (e) {
    console.error('Graph Note could not draw the schema of', picture.graph, e);
    return false;
  }
  if (drawn && 'reason' in drawn) return false; // too large to lay out: shown as its text, as any graph is
  if (!drawn) return true; // no longer wanted: a newer drawing of this card was asked for, or the plugin unloaded
  const target = { path: ctx.sourcePath, line: info?.lineStart ?? 0, graph: picture.graph };
  ctx.addChild(
    graphCard(el.createDiv({ cls: 'graph-note' }), {
      source,
      reading: picture.reading,
      graph: picture.graph,
      drawn,
      problems: [],
      mode: 'note',
      lineOf: (place) => (blocks[at]?.line ?? 0) + place.line,
      onEdit: () => {
        void plugin.openEditor(target);
      },
      readOnly: () => true,
    }),
  );
  return true;
}
