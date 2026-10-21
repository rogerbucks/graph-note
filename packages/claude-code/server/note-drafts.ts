// Drafts (spec §26, cc_drafts_outside, cc_write_if_unchanged): what was typed and not written. They are kept outside
// the vault, in the mod's own data folder, one file for each note. A file is named by a digest of the vault and the
// note's path in it. So a name says nothing of the note, and no draft is ever a file the vault's app would show. Each
// is written as a note is, by way of a new file renamed into place. It is readable by its owner alone. It is offered
// again when the note is next opened.
import { word } from '@thoughtknot/core';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { inside, type Vault } from './note-place.ts';
import { BODY_LIMIT } from './request-body.ts';
import { NODE_FILES, writeAtomically, type NoteFiles } from './note-file.ts';

/**
 * The most characters a draft's file may hold. That is a note's worth of control characters, each written by JSON as
 * six (`\u0001`), and room for the rest of the record.
 */
const DRAFT_MOST = 6 * BODY_LIMIT + 1024;

/** A draft: what was typed, and the version of the note it was typed against (null when it was not known). */
export interface Draft {
  text: string;
  against: string | null;
}

/** The drafts of one vault's notes, in a folder outside it. */
export class DraftShelf {
  private readonly folder: string;
  private readonly vault: Vault;
  private readonly files: NoteFiles;

  private constructor(folder: string, vault: Vault, files: NoteFiles) {
    this.folder = folder;
    this.vault = vault;
    this.files = files;
  }

  /**
   * The shelf in `folder`, made if need be; refused when the folder is, or would be, inside the vault. Its files are
   * Node's own, never a note's, so a draft is still kept when the note's write is what failed.
   */
  static async open(folder: string, vault: Vault, files: NoteFiles = NODE_FILES): Promise<DraftShelf> {
    const refuse = () => new Error(word('server.drafts-in-vault'));
    const named = resolve(folder);
    const within = (f: string) => inside(vault.real, f) !== null || inside(vault.named, f) !== null;
    if (within(named) || named === vault.real || named === vault.named) throw refuse();
    await fs.mkdir(named, { recursive: true, mode: 0o700 });
    const real = await fs.realpath(named);
    if (within(real) || real === vault.real) throw refuse();
    // its owner's alone, even when it was made before, or under a umask that left it open
    await fs.chmod(real, 0o700);
    return new DraftShelf(real, vault, files);
  }

  /** The draft's file for the note at `inVault`. */
  private fileOf(inVault: string): string {
    const key = createHash('sha256').update(`${this.vault.real}\0${inVault}`, 'utf8').digest('hex');
    return join(this.folder, `${key}.json`);
  }

  /** Keeps `draft` for the note, over any kept before; an empty text clears it. */
  async keep(inVault: string, draft: Draft): Promise<{ ok: true } | { ok: false; why: string }> {
    if (draft.text === '') {
      await this.clear(inVault);
      return { ok: true };
    }
    const record = JSON.stringify({ note: inVault, text: draft.text, against: draft.against });
    const w = await writeAtomically(this.fileOf(inVault), record, 0o600, this.files);
    return w.ok ? { ok: true } : { ok: false, why: w.why };
  }

  /** The note's draft, or null when none is kept or it cannot be read as one. */
  async take(inVault: string): Promise<Draft | null> {
    const raw = await fs.readFile(this.fileOf(inVault), 'utf8').catch(() => null);
    if (raw === null || raw.length > DRAFT_MOST) return null;
    try {
      const d: unknown = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      const { note, text, against } = d as Record<string, unknown>;
      if (note !== inVault || typeof text !== 'string') return null;
      return { text, against: typeof against === 'string' ? against : null };
    } catch {
      return null;
    }
  }

  /** Clears the note's draft, once what was typed has been written. */
  async clear(inVault: string): Promise<void> {
    await this.files.remove(this.fileOf(inVault));
  }
}
