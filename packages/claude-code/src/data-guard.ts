// Stub: the guard is written after its tests (spec §26, the mod's data folder).
export interface GuardPorts {
  /** The mod's data folder, as the mod names it. */
  data: string;
  /** The user's home folder, when known. */
  home?: string;
  /** The session's working folder. */
  cwd: string;
  /** A path's real path, links settled; rejects when the path does not exist. */
  realPath: (path: string) => Promise<string>;
}

export const DATA_FOLDER_REFUSAL = '';

export function guardDataFolder(
  _tool: string,
  _input: { file_path?: unknown; notebook_path?: unknown; command?: unknown },
  _ports: GuardPorts,
): Promise<string | null> {
  return Promise.resolve(null);
}
