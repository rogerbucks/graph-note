// The notes a plug-in given the files ability reaches (editor spec §43, plugin_manifest_limits; TRUST-16). They go
// through the note gate. A plug-in lists and reads only the notes at or below the ceiling the person set for it. With
// none set, that is the lowest class. A note with no class counts as the class set for unlabelled notes, the strictest
// until the person chooses. A note whose class is unknown, or at the highest class, is never shown to it. A note it
// cannot see is as if it were not there. A change it makes is never written: it waits, as a proposal, for the person.
import { classificationOf } from './claude-gate.ts';
import type { NoteStorage, StoredNote, WriteOutcome } from './note-storage.ts';
import { notePath } from './note-storage.ts';

/** Why a change a plug-in makes is not written: it is offered to the person instead. */
export const CHANGE_WAITS = 'the change waits for the person to accept it';

/** A change a plug-in asks for: the note it would write, or remove when `text` is null. */
export interface ProposedNoteChange {
  plugin: string;
  path: string;
  text: string | null;
}

/** What a host offers for the files ability: its notes, its classes, and where a plug-in's changes wait. */
export interface FilesOffer {
  store: NoteStorage;
  /** The classes set, lowest first. */
  levels: readonly string[];
  /** The class a note with none counts as. */
  unlabelled: string;
  /** The highest class the person lets plug-in `pluginId` see; with none, the lowest. */
  ceilingFor?: (pluginId: string) => string | undefined;
  /** Shows the person a change a plug-in asks for, as a proposal they accept or refuse. */
  propose: (change: ProposedNoteChange) => void;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The notes of `offer.store` that plug-in `pluginId` may see, read through the gate, with its changes held back. */
export function gatedFiles(offer: FilesOffer, pluginId: string): NoteStorage {
  const { levels } = offer;
  const rank = (level: string) => levels.findIndex((l) => same(l, level));
  const wanted = offer.ceilingFor?.(pluginId);
  const ceiling = wanted === undefined ? 0 : rank(wanted);
  /** Whether a note's text is at or below the ceiling, and below the highest class. */
  const visible = (text: string): boolean => {
    const c = classificationOf(text);
    if (c.kind === 'unknown') return false;
    const at = rank(c.kind === 'given' ? c.level : offer.unlabelled);
    return at !== -1 && at < levels.length - 1 && at <= ceiling;
  };
  const seen = async (path: string): Promise<StoredNote | null> => {
    const note = await offer.store.read(notePath(path));
    return note && visible(note.text) ? note : null;
  };
  const held = async (path: string, text: string | null): Promise<WriteOutcome> => {
    const current = await seen(path);
    offer.propose(Object.freeze({ plugin: pluginId, path: notePath(path), text }));
    return { ok: false, reason: CHANGE_WAITS, current };
  };
  const gated: NoteStorage = {
    list: async () => {
      const shown: string[] = [];
      for (const path of await offer.store.list()) if (await seen(path)) shown.push(path);
      return shown;
    },
    read: seen,
    write: (path, text) => held(path, text),
    remove: (path) => held(path, null),
  };
  return Object.freeze(gated);
}
