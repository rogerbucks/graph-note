// The image an export writes (spec §16): laid out where a drawing is, apart from the interface and under the same limits
// (layout_contained), in the fixed colours chosen, framed, and kept as SVG or drawn as a PNG at twice natural size or
// more (export_png_sharp). A PNG too large for one sharp image is drawn on pages, each its own file, named in order
// (big_export); one too large even for pages is refused, with the SVG suggested. Every page is drawn before any is
// written, so a page that cannot be drawn leaves nothing behind.
import { exportWithLayout, pageSvg, pngPages, pngSize } from '@graph-note/core';
import type {
  ExportGo,
  ExportInfo,
  ExportLayout,
  ExportScope,
  ExportTheme,
  NoteReading,
  StyleGraph,
} from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { exportFailureWords, exportRefusalWords } from '../layout-worker/refusal-words';

/** One file an export writes: its name, its path in the vault, and its bytes or text. */
export interface ExportFile {
  name: string;
  path: string;
  bytes: Uint8Array | string;
}

/**
 * What the image is made from: the scope, the colours, the style, where it came from, and the plan's names. The style
 * comes with the graph as read (`data`), whose values the properties it shows inline are drawn with (spec §14): one
 * without the other is a type error, as in the core's `ExportInfo`.
 */
export type ImageAsk = {
  scope: ExportScope;
  format: 'svg' | 'png';
  theme: ExportTheme;
  note: string;
  date: string;
  go: ExportGo;
  /** The plan again, for a PNG split across `pages` pages: the same names, each page's among them. */
  paged: (pages: number) => ExportGo;
} & ({ style: StyleGraph; data: GraphRead } | { style?: undefined; data?: undefined });

/** One graph as the note reads it. */
type GraphRead = NonNullable<NoteReading['world'][string]>;

/** The image's files, one or a page each; or why there are none, in words. Rejects only on a failure not the layout's. */
export async function imageFiles(
  plugin: GraphNotePlugin,
  x: ImageAsk,
): Promise<{ files: ExportFile[] } | { stopped: string }> {
  let layoutFailed = false;
  const layout: ExportLayout = (d, theme) =>
    plugin.layoutForExport(d, theme).catch((e: unknown) => {
      layoutFailed = true;
      throw e;
    });
  // drawn with its style — nudges, arrowheads hidden and properties shown inline — and the values those properties have
  const basics = { note: x.note, date: x.date, theme: x.theme };
  const info: ExportInfo = x.style ? { ...basics, style: x.style, data: x.data } : basics;
  let image;
  try {
    image = await exportWithLayout(x.scope, layout, info);
  } catch (e) {
    // the layout worker or its engine failed: told as a limit is, with what to do; any other failure is the caller's
    if (!layoutFailed) throw e;
    return { stopped: exportFailureWords(e) };
  }
  if (!image)
    return {
      stopped:
        'The export was stopped: Graph Note was unloaded before the layout finished. Nothing was saved. Try again once Graph Note is enabled again.',
    };
  if ('reason' in image) return { stopped: exportRefusalWords(image) };
  const { go } = x;
  if (x.format === 'svg') return { files: [{ name: go.fileName, path: go.path, bytes: image.svg }] };
  const pages = pngPages(image.width, image.height, plugin.pngPixelLimit);
  if (!pages) {
    const size = pngSize(image.width, image.height);
    return {
      stopped: `The drawing is too large to draw as a PNG on this device (${size.width} by ${size.height}), even across pages; export it as SVG.`,
    };
  }
  if (pages.length === 1)
    return {
      files: [
        {
          name: go.fileName,
          path: go.path,
          bytes: await plugin.rasterise(image.svg, pngSize(image.width, image.height)),
        },
      ],
    };
  const named = x.paged(pages.length).pages ?? [];
  const files: ExportFile[] = [];
  for (const [i, page] of pages.entries()) {
    const at = named[i];
    if (!at) throw new Error(`page ${i + 1} has no name`);
    files.push({
      name: at.fileName,
      path: at.path,
      bytes: await plugin.rasterise(pageSvg(image.svg, page), pngSize(page.width, page.height)),
    });
  }
  return { files };
}
