// Notes kept in an Obsidian vault (editor spec §41, storage_contract): not built yet.
import type { App } from 'obsidian';
import type { NoteStorage } from '@thoughtknot/core';
import { memoryStorage } from '@thoughtknot/core';

/** The notes of the app's vault: not built yet. */
export const vaultStorage = (_app: App): NoteStorage => memoryStorage();
