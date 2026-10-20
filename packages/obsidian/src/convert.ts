// Converting the note in front back to standard GQL (spec §21), checked by the standard checker before it is written.
import { Notice } from 'obsidian';
import { toStandard, word } from '@thoughtknot/core';
import type { Converted } from '@thoughtknot/core';
import type ThoughtKnotPlugin from './main';
import { noteToRewrite, stillToRewrite } from './reading-view';

/** Converts the note in front back to standard GQL, and says what it did, or why it did nothing. */
export async function convertToStandard(plugin: ThoughtKnotPlugin): Promise<void> {
  const { workspace, vault } = plugin.app;
  // the note in the pane in front, unless that pane is in reading view, which never changes a note (spec §3)
  const to = word('host.to-convert');
  const front = noteToRewrite(workspace, to);
  if (!front) return;
  const { file } = front;
  const checked = toStandard(await vault.read(file));
  if (!checked.ok) {
    new Notice(word('host.not-converted', { why: checked.reason }));
    return;
  }
  if (!checked.changed) {
    new Notice(word('host.already-standard'));
    return;
  }
  // the pane in front is asked again now, after the waiting: one switched to reading view meanwhile is not written
  if (!stillToRewrite(workspace, front, to)) return;
  // written against the note as it is when written, and checked again there: said only when it was written
  let written: Converted = checked;
  await vault.process(file, (now) => {
    written = toStandard(now);
    return written.ok ? written.note : now;
  });
  const done = written as Converted;
  if (!done.ok) new Notice(word('host.not-converted-meanwhile', { why: done.reason }));
  else if (!done.changed) new Notice(word('host.already-standard'));
  else new Notice(word('host.converted', { count: done.changed }));
}
