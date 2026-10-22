// The editor's notes read and written through the one storage interface (editor spec §41, storage_contract; §26). Each
// note's place is checked again before it is read (cc_no_escape, note-place.ts). The store reads it whole. It writes
// it by way of a temporary file renamed into place (folder-storage.ts), against the version it was read at.
import { sep } from 'node:path';
import type { NoteStorage } from '@thoughtknot/core';
import { word } from '@thoughtknot/core';
import { faultOf } from './folder-storage.ts';
import { notePlace, type Vault } from './note-place.ts';

/** A note as read where it was opened: its text and version, its path in the store and its real one; or why not. */
export type Loaded =
  { ok: true; text: string; version: string; path: string; real: string } | { ok: false; why: string };

/** The note at `inVault` read from `kept`, its place in `where` checked again first. */
export async function loadNote(kept: NoteStorage, where: Vault, inVault: string): Promise<Loaded> {
  const place = await notePlace(where, inVault);
  if (!place.ok || place.inVault !== inVault) return { ok: false, why: word('server.note-moved') };
  const path = inVault.split(sep).join('/');
  try {
    const r = await kept.read(path);
    return r ? { ok: true, ...r, path, real: place.real } : { ok: false, why: word('server.note.not-there') };
  } catch (e) {
    return { ok: false, why: faultOf(e) };
  }
}

/** Writes `text` over the note as `now` read it: its new version, or why nothing changed. */
export async function writeNote(
  kept: NoteStorage,
  now: { path: string; version: string },
  text: string,
): Promise<{ ok: true; version: string } | { ok: false; why: string }> {
  try {
    const done = await kept.write(now.path, text, { expected: now.version });
    return done.ok ? { ok: true, version: done.version ?? now.version } : { ok: false, why: done.reason };
  } catch (e) {
    return { ok: false, why: faultOf(e) };
  }
}
