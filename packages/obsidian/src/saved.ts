// What the plugin keeps in its own data, apart from the vault. It keeps the drafts, the settings and the record of sends
// to AI. It keeps the plug-ins from outside turned on, where the details were last put, and the person's own profile.
import type { SendRecord } from '@thoughtknot/core';
import type { KeptDraft } from '@thoughtknot/core/display/editor/editor-note';
import type { TurnedOn } from './outside/outside-plugins';
import type { KeptProfile } from './profile/profiles';

/** What was typed in the pane and kept when the note changed under it, by note and graph: never lost (spec §9). */
export type Drafts = Record<string, KeptDraft>;

/** The plugin's own data, as kept: each part read once at load and written back whole. */
export interface Saved {
  drafts?: Drafts;
  settings?: unknown;
  /** The record of every send to an AI model (§19, record_every_send): never a key. */
  aiSends?: SendRecord[];
  /** The plug-in files from outside the person turned on, each with its SHA-256 then (§54, plugin_outside_file). */
  outside?: Record<string, TurnedOn>;
  /** Where a card's details were last put, how big and whether minimised (§25, sheet_layout_kept). */
  detailsLayout?: unknown;
  /** The person's own profile, the personal layer: never in a note (§39). */
  profile?: KeptProfile;
}
