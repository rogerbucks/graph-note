// What sets Claude's gate is the user's alone (spec §26, risk TRUST-1). Two things in the vault set it: the matrix note
// that gives Claude's row, and each note's classification line in its front matter. A session that could change either
// could lower its own gate. So Claude's own writes to them are refused, as its writes to the data folder are.
//
// The matrix note is named in the settings by its path inside the vault. Any vault may hold it, so a write is refused
// when its real path ends with that path. For Bash, the note's file name alone counts.
//
// A classification is judged by what the call leaves. The note is read, the call's change is made to a copy, and the
// classification before and after is compared. A note not yet made has none to change, so a new note may be written.
// When the note cannot be read, a call is refused if any text it carries holds a classification line. Bash cannot be
// parsed, so a command that names `classification` is refused, unless it only searches or prints with no redirection.
// What a command changes without naming it, such as cutting the front matter by line numbers, is not seen. GUIDE.md
// says so.
import { classificationOf } from '@thoughtknot/core';
import { forms, namesWord, pathOf } from './data-guard.ts';
import type { GuardPorts, ToolInput } from './data-guard.ts';

/** The refusal on the matrix note: it names no path or text of the call. */
export const MATRIX_NOTE_REFUSAL =
  'thoughtknot: this is the matrix note named in the settings, which sets what Claude may open, so Claude may not ' +
  'change it. The user edits it in their vault. Nothing was changed.';

/** The refusal on a classification line: it names no level, path or text of the call. */
export const CLASSIFICATION_REFUSAL =
  'thoughtknot: this call would change a note’s classification, which sets what Claude may open, so Claude may not ' +
  'make it. Ask the user to change the classification in the note themselves. Nothing was changed.';

/** The refusal when the guard could not tell where a path leads. */
export const GATE_CHECK_FAILED_REFUSAL =
  'thoughtknot: this call was refused because the guard for what sets Claude’s gate could not check where it leads ' +
  '(node could not be run, or did not answer). Nothing was changed. Try again, or ask the user.';

/** What this guard asks of the host: the matrix note's path in the vault (none when none is set), and a read. */
export type GatePorts = Omit<GuardPorts, 'data'> & {
  matrixNote: string | null;
  /** A file's text; rejects when it cannot be read. With none, any classification line in a call refuses it. */
  read?: (path: string) => Promise<string>;
};

/** A line that sets a classification, top-level or not: what the gate's own reader looks for. */
const CLASSIFICATION_LINE = /^\s*-?\s*["']?classification["']?\s*:/im;

/** A command that only searches or prints, with nothing to write its output. */
const ONLY_READS = /^\s*(grep|rg|cat|head|tail|less)\s[^>|;&`$]*$/;

/** One change of an edit: the text replaced, its replacement, and whether every copy is replaced. */
type Change = { old_string?: unknown; new_string?: unknown; replace_all?: unknown };

/** The text after `changes`, made one by one to `text`; a change whose text is not found leaves it, as the tool fails. */
function afterChanges(text: string, changes: readonly Change[]): string {
  let out = text;
  for (const c of changes) {
    if (typeof c.old_string !== 'string' || typeof c.new_string !== 'string' || !c.old_string) continue;
    out =
      c.replace_all === true
        ? out.split(c.old_string).join(c.new_string)
        : out.replace(c.old_string, () => String(c.new_string));
  }
  return out;
}

/** The note's text after the call, or null when the call's tool is not one whose result can be worked out. */
function textAfter(tool: string, input: Record<string, unknown>, before: string): string | null {
  if (tool === 'Write' && typeof input.content === 'string') return input.content;
  if (tool === 'Edit') return afterChanges(before, [input]);
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) return afterChanges(before, input.edits as Change[]);
  return null;
}

/** Every text a call carries, however deep: what is judged when the note cannot be read. */
function textsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(textsOf);
  return [];
}

/** The matrix note's path in the vault, as parts joined by `/`, without a leading `./` or `/`. */
const vaultPath = (note: string) => note.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');

async function guardClassification(tool: string, path: string, input: Record<string, unknown>, ports: GatePorts) {
  let before: string | null = null;
  try {
    before = ports.read ? await ports.read(path) : null;
  } catch {
    // a note not yet made has no classification to change
    if (tool === 'Write') return null;
  }
  const after = before === null ? null : textAfter(tool, input, before);
  if (before !== null && after !== null) {
    const same = JSON.stringify(classificationOf(before)) === JSON.stringify(classificationOf(after));
    return same ? null : CLASSIFICATION_REFUSAL;
  }
  const carried = textsOf({ ...input, file_path: '', notebook_path: '', path: '' });
  return carried.some((t) => CLASSIFICATION_LINE.test(t)) ? CLASSIFICATION_REFUSAL : null;
}

/**
 * The refusal for a call that would change what sets Claude's gate: the matrix note, or a note's classification line.
 * Null when the call may go on. Reads are not judged.
 */
export async function guardGateFiles(tool: string, input: ToolInput, ports: GatePorts): Promise<string | null> {
  const note = ports.matrixNote ? vaultPath(ports.matrixNote) : '';
  if (tool === 'Bash') {
    const command = typeof input.command === 'string' ? input.command.replace(/['"`\\]/g, '') : '';
    if (note && namesWord(command, note.slice(note.lastIndexOf('/') + 1))) return MATRIX_NOTE_REFUSAL;
    if (namesWord(command, 'classification') && !ONLY_READS.test(command)) return CLASSIFICATION_REFUSAL;
    return null;
  }
  const path = pathOf(tool, input);
  if (path === null) return null;
  try {
    if (note) {
      const tail = `/${note.toLowerCase()}`;
      if ((await forms(path, { ...ports, data: '' })).some((f) => f.toLowerCase().endsWith(tail)))
        return MATRIX_NOTE_REFUSAL;
    }
  } catch {
    return GATE_CHECK_FAILED_REFUSAL;
  }
  return guardClassification(tool, path, input, ports);
}
