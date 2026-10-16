// The mod's data folder is the user's alone (spec §26): it holds settings.json, which sets Claude's classification gate
// (the ceiling, the matrix row, the classes switched on, the level for an unlabelled note), and the editor's drafts. A
// session that could write there could loosen its own gate, so Claude's own Write, Edit, NotebookEdit and Bash calls are
// refused when they reach it. Reads stay allowed.
//
// File tools are judged by the target's real path, links settled, a relative path taken from the session's folder and a
// file not yet made by its nearest folder that exists. Bash cannot be parsed, so the rule is the conservative one: a
// command is refused when it names the folder at all, as written, through the home folder or $CLAUDE_PLUGIN_DATA, or in
// a word that resolves into it. What it cannot see (a path built by the shell, such as `cd` then a bare file name, or a
// variable other than those named) it does not stop; GUIDE.md says so. No Node module is imported: the real path is
// asked through the port.

/** The tools whose target is a file path, and the field that holds it. */
const FILE_TOOLS: Readonly<Record<string, 'file_path' | 'notebook_path'>> = {
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
};

/** The most words of a command that are looked up as paths, each a process to start. */
const MAX_WORDS = 40;

/** The refusal, in words: it names no path, command or text of the call. */
export const DATA_FOLDER_REFUSAL =
  'graph-note: this is the mod’s data folder, which holds the settings (settings.json) that decide what Claude ' +
  'may open, so Claude may not write to it. The user changes these settings, by editing settings.json in the ' +
  'graph-note plugin data folder (CLAUDE_PLUGIN_DATA, or else the plugins data folder under their Claude config ' +
  'folder). Nothing was changed.';

/** What the guard asks of the host: the folder, the home and working folders, and a real-path call. */
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

/** A path with `.` and `..` settled by its text alone. */
function normalise(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

/** `path` as a full path: `~` is the home folder, a relative path starts at the session's folder. */
function absolute(path: string, ports: GuardPorts): string {
  if (path === '~' || path.startsWith('~/')) return ports.home ? `${ports.home}${path.slice(1)}` : path;
  return path.startsWith('/') ? path : `${ports.cwd}/${path}`;
}

/** Whether `path` is `folder` or inside it. */
function inside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** The real path of `path`, or of its nearest parent that exists with the rest put back; null when none can be had. */
async function settle(path: string, ports: GuardPorts): Promise<string | null> {
  let rest = '';
  let head = path;
  for (;;) {
    try {
      const real = await ports.realPath(head);
      return rest ? `${real.replace(/\/$/, '')}${rest}` : real;
    } catch {
      const cut = head.lastIndexOf('/');
      if (cut <= 0) return null;
      rest = `${head.slice(cut)}${rest}`;
      head = head.slice(0, cut);
    }
  }
}

/** Every form of `path` that matters: as written and normalised, and the real path of each. */
async function forms(path: string, ports: GuardPorts): Promise<string[]> {
  const full = absolute(path, ports);
  const out = new Set<string>([normalise(full)]);
  for (const text of [full, normalise(full)]) {
    const real = await settle(text, ports);
    if (real !== null) out.add(normalise(real));
  }
  return [...out];
}

/** The data folder as written and as its real path. */
async function folders(ports: GuardPorts): Promise<string[]> {
  return forms(ports.data, ports);
}

/** Whether `text` holds `needle` as a whole path: what follows it is not part of a longer name. */
function names(text: string, needle: string): boolean {
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    if (!/[A-Za-z0-9._-]/.test(text.charAt(at + needle.length))) return true;
  }
  return false;
}

/** The ways a command may write the data folder's own path: as given, real, through the home folder. */
function spellings(folderForms: readonly string[], ports: GuardPorts): string[] {
  const out = new Set<string>(['CLAUDE_PLUGIN_DATA']);
  const home = ports.home?.replace(/\/$/, '');
  for (const form of [ports.data, ...folderForms]) {
    out.add(form);
    if (home && form.startsWith(`${home}/`)) {
      const rest = form.slice(home.length);
      out.add(`~${rest}`);
      out.add(`$HOME${rest}`);
      out.add(`\${HOME}${rest}`);
    }
  }
  return [...out];
}

async function guardFile(path: string, ports: GuardPorts): Promise<string | null> {
  const where = await folders(ports);
  for (const form of await forms(path, ports)) {
    if (where.some((folder) => inside(form, folder))) return DATA_FOLDER_REFUSAL;
  }
  return null;
}

async function guardCommand(command: string, ports: GuardPorts): Promise<string | null> {
  const where = await folders(ports);
  if (spellings(where, ports).some((spelling) => names(command, spelling))) return DATA_FOLDER_REFUSAL;
  const words = command
    .split(/[\s'"`;|&<>()=,]+/)
    .filter((word) => word.includes('/') || word.startsWith('.') || word.startsWith('~'))
    .slice(0, MAX_WORDS);
  for (const word of words) {
    for (const form of await forms(word, ports)) {
      if (where.some((folder) => inside(form, folder))) return DATA_FOLDER_REFUSAL;
    }
  }
  return null;
}

/**
 * The refusal for a call that would write the mod's data folder, or null when the call may go on. Any tool but the file
 * writers and Bash is not judged (Read, Grep and the rest only read).
 */
export async function guardDataFolder(
  tool: string,
  input: { file_path?: unknown; notebook_path?: unknown; command?: unknown },
  ports: GuardPorts,
): Promise<string | null> {
  if (tool === 'Bash') {
    return typeof input.command === 'string' && input.command ? guardCommand(input.command, ports) : null;
  }
  const field = FILE_TOOLS[tool];
  if (!field) return null;
  const path = input[field];
  return typeof path === 'string' && path ? guardFile(path, ports) : null;
}
