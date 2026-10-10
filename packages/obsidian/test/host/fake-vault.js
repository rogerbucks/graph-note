// Stand-ins for the vault's own ways of making files (spec §16, export): create, create binary, modify, rename, delete
// and make a folder, each kept in `state.files` by path, with a way to make one fail as a full disk would; and the
// metadata cache's front matter, read from a note's text.

/** Adds the vault's file-making operations to `vault`; `state.failWrite` names a path whose writes fail with ENOSPC. */
export function addVaultWrites(vault, state, file) {
  const files = state.files;
  const fail = (path) => {
    if (state.failWrite && path.startsWith(state.failWrite)) {
      const e = new Error('no space left on device');
      e.code = 'ENOSPC';
      throw e;
    }
  };
  const put = (path, data) => {
    fail(path);
    files.set(path, data);
    (state.writes ??= []).push(path);
    return file(path);
  };
  state.folders = state.folders ?? new Set();
  Object.assign(vault, {
    create: async (path, text) => {
      if (files.has(path)) throw new Error('File already exists.');
      return put(path, text);
    },
    createBinary: async (path, data) => {
      if (files.has(path)) throw new Error('File already exists.');
      return put(path, data);
    },
    modifyBinary: async (f, data) => void put(f.path, data),
    rename: async (f, to) => {
      if (files.has(to)) throw new Error('Destination file already exists!');
      fail(to);
      files.set(to, files.get(f.path));
      files.delete(f.path);
    },
    delete: async (f) => void files.delete(f.path),
    createFolder: async (path) => void state.folders.add(path),
    getFolderByPath: (path) => (path === '' || state.folders.has(path) ? { path } : null),
  });
}

/** The file manager: a file put in the trash is gone from the vault. */
export function fakeFileManager(state) {
  return { trashFile: async (f) => void state.files.delete(f.path) };
}

/** The metadata cache: a note's front matter, read from the lines between its opening and closing `---`. */
export function fakeMetadataCache(state) {
  return {
    getFileCache: (f) => {
      const text = state.files.get(f.path) ?? '';
      const m = /^---\n([\s\S]*?)\n---/.exec(text);
      if (!m) return {};
      const frontmatter = {};
      for (const line of m[1].split('\n')) {
        const kv = /^(\w+):\s*(.*)$/.exec(line);
        if (kv) frontmatter[kv[1]] = kv[2];
      }
      return { frontmatter };
    },
  };
}
