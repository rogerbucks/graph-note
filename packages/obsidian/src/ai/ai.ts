// Asking an AI model to propose changes (spec §19). The command only says so while AI is off or no model is set up
// (ai_off_until_chosen). Otherwise it opens the send dialog on the note in front. The note's classification is read
// from its text as well as the metadata cache, and the higher is taken. Obsidian has no AI of its own to
// offer first (host_ai_first), so only the models set up in the settings are offered. And the command that clears the
// record of sends (record_every_send), which keeps only the last ones and never the text sent.
import { Notice } from 'obsidian';
import { aiReady, word } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { classificationInText, classificationOf, higherClassification } from '../export/classification';
import { noteToRewrite } from '../reading-view';
import { SendDialog } from './send-dialog';
import { noteText } from '../storage/plugin-notes';

/** The command's id and name. */
export const AI_COMMAND = {
  id: 'ask-ai-model',
  get name(): string {
    return word('host.command.ask-ai');
  },
};

/** The command that clears the record of sends: its id and name. */
export const CLEAR_SENDS_COMMAND = {
  id: 'clear-ai-sends',
  get name(): string {
    return word('host.command.clear-sends');
  },
};

/** How many sends the record keeps: the oldest is let go when one more is recorded. */
export const SENDS_KEPT = 200;

/** Opens the send dialog on the note in front; or says why not: AI is off, or no note is in front to write a proposal into. */
export async function askAi(plugin: ThoughtKnotPlugin): Promise<void> {
  const ready = aiReady(plugin.settings);
  if ('off' in ready) {
    new Notice(ready.off);
    return;
  }
  // the proposal is written into the note, so a note in reading view is refused, as any command that writes is
  const front = noteToRewrite(plugin.app.workspace, word('host.to-ask-ai'));
  if (!front) return;
  const text = (await noteText(plugin.app, front.file.path)) ?? '';
  // read from the text being sent as well as the metadata cache, which can be behind it. The higher is taken. Read
  // again each time the dialog shows what will be sent, against the classifications as they are then
  const levelOf = () => {
    const { classifications: levels, aiUnlabelled } = plugin.settings;
    return higherClassification(
      classificationOf(plugin.app, front.file, text, levels),
      classificationInText(text, levels),
      levels,
      aiUnlabelled,
    );
  };
  new SendDialog(plugin, front.file, text, levelOf, await plugin.sharedSchemas()).open();
}

/** Clears the record of sends, saying how many were let go. */
export async function clearAiSends(plugin: ThoughtKnotPlugin): Promise<void> {
  const n = await plugin.clearAiSends();
  new Notice(word('host.sends-cleared', { count: n }));
}
