// Asking an AI model to propose changes (spec §19): the command, which does nothing but say so while AI is off or no
// model is set up (ai_off_until_chosen), and otherwise opens the send dialog on the note in front, with the note's
// classification read as an export reads it. Obsidian has no AI of its own to offer first (host_ai_first), so only the
// models set up in the settings are offered.
import { Notice } from 'obsidian';
import { aiReady } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { classificationOf } from '../export/classification';
import { noteToRewrite } from '../reading-view';
import { SendDialog } from './send-dialog';

/** The command's id and name. */
export const AI_COMMAND = { id: 'ask-ai-model', name: 'Ask an AI model to propose changes' };

/** Opens the send dialog on the note in front; or says why not: AI is off, or no note is in front to write a proposal into. */
export async function askAi(plugin: GraphNotePlugin): Promise<void> {
  const ready = aiReady(plugin.settings);
  if ('off' in ready) {
    new Notice(ready.off);
    return;
  }
  // the proposal is written into the note, so a note in reading view is refused, as any command that writes is
  const front = noteToRewrite(plugin.app.workspace, 'to ask an AI model about its graph');
  if (!front) return;
  const text = await plugin.app.vault.read(front.file);
  const level = classificationOf(plugin.app, front.file, text, plugin.settings.classifications);
  new SendDialog(plugin, front.file, text, level, await plugin.sharedSchemas()).open();
}
