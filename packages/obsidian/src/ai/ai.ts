// Asking an AI model to propose changes (spec §19): the command, which does nothing but say so while AI is off or no
// model is set up (ai_off_until_chosen), and otherwise opens the send dialog on the note in front, with the note's
// classification read from its text as well as the metadata cache, the higher taken. Obsidian has no AI of its own to
// offer first (host_ai_first), so only the models set up in the settings are offered. And the command that clears the
// record of sends (record_every_send), which keeps only the last ones and never the text sent.
import { Notice } from 'obsidian';
import { aiReady } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { classificationInText, classificationOf, higherClassification } from '../export/classification';
import { noteToRewrite } from '../reading-view';
import { SendDialog } from './send-dialog';

/** The command's id and name. */
export const AI_COMMAND = { id: 'ask-ai-model', name: 'Ask an AI model to propose changes' };

/** The command that clears the record of sends: its id and name. */
export const CLEAR_SENDS_COMMAND = { id: 'clear-ai-sends', name: 'Clear the record of sends to AI models' };

/** How many sends the record keeps: the oldest is let go when one more is recorded. */
export const SENDS_KEPT = 200;

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
  // read from the text being sent as well as the metadata cache, which can be behind it: the higher is taken
  const levels = plugin.settings.classifications;
  const level = higherClassification(
    classificationOf(plugin.app, front.file, text, levels),
    classificationInText(text, levels),
    levels,
    plugin.settings.aiUnlabelled,
  );
  new SendDialog(plugin, front.file, text, level, await plugin.sharedSchemas()).open();
}

/** Clears the record of sends, saying how many were let go. */
export async function clearAiSends(plugin: GraphNotePlugin): Promise<void> {
  const n = await plugin.clearAiSends();
  new Notice(`Cleared the record of ${n} send${n === 1 ? '' : 's'} to AI models.`);
}
