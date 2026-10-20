// Notes kept in a plain folder (editor spec §41, storage_contract): not built yet.
import type { NoteStorage } from '@thoughtknot/core';
import { memoryStorage } from '@thoughtknot/core';

/** The notes of the folder at `root`: not built yet. */
export const folderStorage = (_root: string): NoteStorage => memoryStorage();
