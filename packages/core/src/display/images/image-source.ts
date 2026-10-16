// The images a card's things name (spec §18), as the display layer sees them: found and read by the host (the Obsidian
// plugin's `vault-images.ts` finds them in the vault), shown by the layer.

/** An image found by the host: its file's name and path, its type, its size on disk, and a way to read its bytes. */
export interface FoundImage {
  name: string;
  path: string;
  mime: string;
  size: number;
  /** The address the host shows it from without its bytes being read here: for a photograph too large to read. */
  url: string;
  read(): Promise<Uint8Array>;
}

/** The images a card's things name: found from its note, or why not; null for a value that names no image. */
export interface ImageSource {
  find(value: string): FoundImage | { why: string } | null;
}
