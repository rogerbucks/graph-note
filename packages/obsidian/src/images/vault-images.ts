// The images a note's things name, found in the vault (editor spec §18, animated_image_shown): a property's value read
// by the core (`imageLink`) as a link or a path to an image attached in the vault, found as Obsidian finds a link from
// that note, and read through the vault's API. Only the vault's own files: an address outside it is never loaded (§13,
// a later slice), and a place that could leave the vault is refused, each with the core's words.
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { imageLink } from '@thoughtknot/core';
import type { FoundImage, ImageSource } from '@thoughtknot/core/display/images/image-source';

/** The type each image file is read as, by its extension. */
const MIME: Record<string, string> = {
  gif: 'image/gif',
  png: 'image/png',
  apng: 'image/apng',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
};

export type { FoundImage, ImageSource };

/** The images of the note at `notePath`, found by the app's metadata cache and read through its vault's API. */
export function vaultImages(
  { vault, metadataCache }: Pick<App, 'vault' | 'metadataCache'>,
  notePath: string,
): ImageSource {
  return {
    find(value) {
      const image = imageLink(value);
      if (!image) return null;
      if ('refused' in image) return { why: image.refused };
      const file = metadataCache.getFirstLinkpathDest(image.link, notePath);
      if (!(file instanceof TFile)) return { why: `${image.link} is not in the vault` };
      return {
        name: file.name,
        path: file.path,
        mime: MIME[file.extension.toLowerCase()] ?? 'application/octet-stream',
        size: file.stat.size,
        url: vault.getResourcePath(file),
        read: async () => new Uint8Array(await vault.readBinary(file)),
      };
    },
  };
}
