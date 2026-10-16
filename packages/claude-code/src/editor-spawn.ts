// What `$.process.spawn` hands the launcher (spec §26): a started process's output piece by piece, then how it ended.

/** One piece of what a started process wrote, as `$.process.spawn` hands it over. */
export interface SpawnedPiece {
  stream: 'stdout' | 'stderr';
  text: string;
}

/** How a started process ended. */
export interface SpawnedEnd {
  code: number | null;
  signal: string | null;
}

/** What `$.process.spawn` returns: the pieces, then how it ended; leaving the loop (`return`) kills the child. */
export interface Spawned {
  [Symbol.asyncIterator](): AsyncIterator<SpawnedPiece, SpawnedEnd>;
}
