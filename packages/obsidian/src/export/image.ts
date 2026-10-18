// The image an export writes (spec §16): laid out where a drawing is, apart from the interface and under the same limits
// (layout_contained), in the fixed colours chosen, framed, and kept as SVG or drawn as a PNG at twice natural size or
// more (export_png_sharp). A PNG too large for one sharp image is drawn on pages, each its own file, named in order
// (big_export); one too large even for pages is refused, with the SVG suggested. Every page is drawn before any is
// written, so a page that cannot be drawn leaves nothing behind. The images on boxes are read from the vault and
// embedded in the file (§18), and what was done with each animated image is said (export_animation_stated).
import { Platform, arrayBufferToBase64 } from 'obsidian';
import {
  IMAGE_LIMITS,
  animationSaid,
  exportWithLayout,
  imageFacts,
  pageSvg,
  pngPages,
  pngSize,
} from '@thoughtknot/core';
import type {
  ExportGo,
  ExportInfo,
  ExportLayout,
  ExportScope,
  ExportTheme,
  ExportWalk,
  NoteReading,
  PictureLoad,
  StyleGraph,
  TooLargeToAnimate,
} from '@thoughtknot/core';
import { exportFailureWords, exportRefusalWords } from '@thoughtknot/core/hosts/refusal-words';
import type ThoughtknotPlugin from '../main';
import { vaultImages } from '../images/vault-images';
import { STILL_PIXELS } from '@thoughtknot/core/display/images/still-frame';

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
  /** A path played into the image (§7): an animated SVG of it. */
  walk?: ExportWalk;
} & ({ style: StyleGraph; data: GraphRead } | { style?: undefined; data?: undefined });

/** What an animated SVG too large for the device says (animation_export_fits): why, that nothing was saved, and the fix. */
export const tooLargeWords = (t: TooLargeToAnimate): string =>
  `The animated SVG was not made: ${t.why}. Nothing was saved. To make it fit, ${t.fix}.`;

/** The device an export is made on, for the size an animated SVG may be. */
export const deviceOf = (): 'phone' | 'desktop' => (Platform.isMobile ? 'phone' : 'desktop');

/** One graph as the note reads it. */
type GraphRead = NonNullable<NoteReading['world'][string]>;

/** The image's files, one or a page each; or why there are none, in words. Rejects only on a failure not the layout's. */
export async function imageFiles(
  plugin: ThoughtknotPlugin,
  x: ImageAsk,
): Promise<{ files: ExportFile[]; animation?: string } | { stopped: string }> {
  let layoutFailed = false;
  const layout: ExportLayout = (d, theme) =>
    plugin.layoutForExport(d, theme).catch((e: unknown) => {
      layoutFailed = true;
      throw e;
    });
  // drawn with its style — nudges, arrowheads hidden and properties shown inline — and the values those properties have;
  // an SVG moves the links its style moves, and plays a path it is given (§7), where a PNG is drawn still
  const basics = {
    note: x.note,
    date: x.date,
    theme: x.theme,
    motion: x.format === 'svg',
    device: deviceOf(),
    ...(x.walk ? { walk: x.walk } : {}),
    pictures: picturesFrom(plugin, x.note), // the images on boxes, embedded in the file (§18)
  };
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
        'The export was stopped: Thoughtknot was unloaded before the layout finished. Nothing was saved. Try again once Thoughtknot is enabled again.',
    };
  if ('reason' in image) return { stopped: exportRefusalWords(image) };
  if ('why' in image) return { stopped: tooLargeWords(image) };
  const { go } = x;
  // what was done with each animated image, said with the outcome (export_animation_stated)
  const said = image.animation ? { animation: animationSaid(image.animation) } : {};
  if (x.format === 'svg') return { files: [{ name: go.fileName, path: go.path, bytes: image.svg }], ...said };
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
      ...said,
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
  return { files, ...said };
}

/**
 * The loader of the images on an export's boxes (§18, export-pictures.ts): each found from the note at `note`, read
 * through the vault, what its bytes say, and, for one that moves, its first frame drawn; or why it cannot be had.
 */
function picturesFrom(plugin: ThoughtknotPlugin, note: string): PictureLoad {
  const source = vaultImages(plugin.app, note);
  return async (value) => {
    const found = source.find(value);
    if (!found) return { why: `${value} names no image` };
    if ('why' in found) return found;
    // over the size limit, its size on disk is all that is known: it is never read (review of #443)
    if (found.size > IMAGE_LIMITS.bytes) return { name: found.name, size: found.size, unread: true };
    const bytes = await found.read();
    const facts = imageFacts(bytes);
    const drawable = facts.width * facts.height <= STILL_PIXELS;
    const still =
      (facts.animated || facts.format === null) && drawable ? await plugin.stillFrame(bytes, found.mime) : null;
    return {
      name: found.name,
      mime: found.mime,
      base64: arrayBufferToBase64(bytes.slice().buffer),
      size: found.size,
      facts,
      ...(still ? { still: arrayBufferToBase64(still.slice().buffer) } : {}),
    };
  };
}
