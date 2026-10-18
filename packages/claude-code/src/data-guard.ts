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
  'thoughtknot: this is the mod’s data folder, which holds the settings (settings.json) that decide what Claude ' +
  'may open, so Claude may not write to it. The user changes these settings, by editing settings.json in the ' +
  'thoughtknot plugin data folder (CLAUDE_PLUGIN_DATA, or else the plugins data folder under their Claude config ' +
  'folder). Nothing was changed.';

/** The refusal when the guard could not tell where a path leads, so it cannot say the call leaves the folder alone. */
export const CHECK_FAILED_REFUSAL =
  'thoughtknot: this call was refused because the guard for the mod’s data folder could not check where it ' +
  'leads (node could not be run, or did not answer). Nothing was changed. Try again, or ask the user.';

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
  /** Where the link at a path leads as a full path, or null when it is no link or not there; rejects on failure. */
  readLink?: (path: string) => Promise<string | null>;
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
  // the case of a name is not told apart: macOS and Windows disks do not, and a folder with only its case changed is
  // never worth refusing less
  const here = path.toLowerCase();
  const there = folder.toLowerCase();
  return here === there || here.startsWith(`${there}/`);
}

/** Why a path could not be settled: a path that is not there is an answer, anything else is a failure. */
function isNotThere(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** How many links in a row are followed before the guard gives up and refuses. */
const MAX_LINKS = 8;

/**
 * The real path of `path`, or of its nearest parent that exists with the rest put back; null when none can be had. A
 * part that is not there but is a link (dangling) is followed to where it leads. Rejects when the real-path or link
 * call cannot run, which the caller takes as a refusal.
 */
async function settle(path: string, ports: GuardPorts, links = 0): Promise<string | null> {
  let rest = '';
  let head = path;
  for (;;) {
    try {
      const real = await ports.realPath(head);
      return rest ? `${real.replace(/\/$/, '')}${rest}` : real;
    } catch (err) {
      if (!isNotThere(err)) throw err;
      const leads = ports.readLink ? await ports.readLink(head) : null;
      if (leads !== null) {
        if (links >= MAX_LINKS) throw new Error('Too many links in a row.');
        return settle(`${normalise(leads)}${rest}`, ports, links + 1);
      }
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
  const hay = text.toLowerCase();
  const find = needle.toLowerCase();
  for (let at = hay.indexOf(find); at >= 0; at = hay.indexOf(find, at + 1)) {
    if (!/[a-z0-9._-]/.test(hay.charAt(at + find.length))) return true;
  }
  return false;
}

/** `plugins/data` as whole path parts, the folder every plugin's data lives in, however it was renamed or moved. */
const PLUGINS_DATA = /(^|[^A-Za-z0-9._-])plugins\/data(?![A-Za-z0-9._-])/i;

/** A command that moves, removes, copies, syncs or links whole folders: `mv`, `rm`, `cp`, `rsync` or `ln` as a command. */
const MOVERS = /(^|[\s;|&(`])(mv|rm|cp|rsync|ln)(?=\s)/;

/**
 * A copy of the command as the shell would read it: quotes and backslashes taken out, and the home folder put in for
 * `$HOME`, `${HOME}`, `~` and `~name` (any named user is taken as the home folder, which only widens the match).
 */
function plain(command: string, ports: GuardPorts): string {
  const bare = command.replace(/['"`\\]/g, '');
  const home = ports.home?.replace(/\/$/, '');
  if (!home) return bare;
  return bare
    .replace(/\$\{HOME\}|\$HOME(?![A-Za-z0-9_])/g, home)
    .replace(/(^|[\s=:;|&<>(])~[A-Za-z0-9_.-]*(?=\/|[\s;|&<>)]|$)/g, (_all, before: string) => `${before}${home}`);
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
  const copy = plain(command, ports);
  if (PLUGINS_DATA.test(copy)) return DATA_FOLDER_REFUSAL;
  const spelt = spellings(where, ports);
  if (spelt.some((spelling) => names(command, spelling) || names(copy, spelling))) return DATA_FOLDER_REFUSAL;
  const words = copy
    .split(/[\s'"`;|&<>()=,]+/)
    .filter((word) => word.includes('/') || word.startsWith('.') || word.startsWith('~'))
    .slice(0, MAX_WORDS);
  const moves = MOVERS.test(copy);
  const home = ports.home ? normalise(ports.home) : null;
  for (const word of words) {
    for (const form of await forms(word, ports)) {
      if (where.some((folder) => inside(form, folder))) return DATA_FOLDER_REFUSAL;
      // moving, removing, copying, syncing or linking a folder above the data folder, below home, takes it too
      if (moves && home && form.toLowerCase() !== home.toLowerCase() && inside(form, home)) {
        if (where.some((folder) => inside(folder, form))) return DATA_FOLDER_REFUSAL;
      }
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
  const field = FILE_TOOLS[tool];
  if (tool !== 'Bash' && !field) return null;
  try {
    if (tool === 'Bash') {
      return typeof input.command === 'string' && input.command ? await guardCommand(input.command, ports) : null;
    }
    const path = input[field as 'file_path' | 'notebook_path'];
    return typeof path === 'string' && path ? await guardFile(path, ports) : null;
  } catch {
    // the real path could not be had (the process did not run, node is missing, it timed out): not knowing is a no
    return CHECK_FAILED_REFUSAL;
  }
}
