// Stand-ins for the vault's own ways of making files (spec §16, export).
// - Create, create binary, modify, rename, delete and make a folder. Each is kept in `state.files` by path, with a way
//   to make one fail as a full disk would.
// - A rename and a deletion told to whoever listens, as Obsidian's vault tells them (spec §9).
// - The metadata cache's front matter, read from a note's text.

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
      state.tell?.('rename', file(to), f.path);
    },
    delete: async (f) => gone(state, f),
    // to the system's trash, outside the vault: gone from it, and in no trash the vault keeps
    trash: async (f) => gone(state, f),
    createFolder: async (path) => void state.folders.add(path),
    getFolderByPath: (path) => (path === '' || state.folders.has(path) ? { path } : null),
  });
}

/** A file gone from the vault, and the deletion told, as Obsidian tells it once the file is gone. */
function gone(state, f) {
  state.files.delete(f.path);
  state.tell?.('delete', f);
}

/**
 * The file manager. A file put in the trash is gone from the vault, and kept in `state.trashed`. A new note goes in the
 * vault's root, as Obsidian's default for new notes puts it.
 */
export function fakeFileManager(state) {
  return {
    trashFile: async (f) => {
      (state.trashed ??= []).push(f.path);
      gone(state, f);
    },
    getNewFileParent: () => ({ path: '/' }),
  };
}

/** The YAML a front matter holds, as far as the tests write it: `key: value` (a number read as one) and `key:` with `- item` lines. */
export function parseYaml(yaml) {
  const out = {};
  let list = null;
  for (const line of yaml.split('\n')) {
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item && list) {
      list.push(item[1]);
      continue;
    }
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    if (kv[2] === '') out[kv[1]] = list = [];
    else {
      list = null;
      out[kv[1]] = /^-?\d+(\.\d+)?$/.test(kv[2]) ? Number(kv[2]) : kv[2];
    }
  }
  return out;
}

/** Where a note's front matter is, as Obsidian's getFrontMatterInfo says it. */
export function getFrontMatterInfo(content) {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  return m ? { exists: true, frontmatter: m[1] } : { exists: false, frontmatter: '' };
}

/**
 * The metadata cache. It has a note's front matter, and its sections where a test gives them in `state.sections` by
 * path. With `state.noCache`, a note is not yet indexed, and has none.
 */
export function fakeMetadataCache(state) {
  return {
    getFileCache: (f) => {
      if (state.noCache) return null;
      const info = getFrontMatterInfo(state.files.get(f.path) ?? '');
      const sections = state.sections?.[f.path];
      return {
        ...(info.exists ? { frontmatter: parseYaml(info.frontmatter) } : {}),
        ...(sections ? { sections } : {}),
      };
    },
  };
}
