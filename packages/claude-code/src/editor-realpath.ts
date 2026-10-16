// A file's real path, for a host that can only start a process (spec §26): a first outline with no behaviour yet.
export const realPathVia =
  (_spawn: unknown) =>
  (_path: string): Promise<string> =>
    Promise.reject(new Error('not yet'));
