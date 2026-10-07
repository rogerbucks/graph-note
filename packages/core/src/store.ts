// Writing a block back to its note (spec §9). The text of the block is the only store of the graph (§2), so a write
// replaces the block's own lines and keeps every other byte — line endings included. A block that changed since the pane
// read it is never overwritten blind: the write is refused, with the block as it now is, so the pane can reload and keep
// what was typed as a draft. Every write is recorded, so it can be undone back to the original bytes.
import { gqlSpans } from './drawing.ts';
import type { Block } from './drawing.ts';

/** The block a pane is editing: the 0-based line of its opening fence, and its text as the pane last read or wrote it. */
export interface BlockRef {
  line: number;
  text: string;
}

export type WriteResult =
  | { ok: true; note: string; ref: BlockRef }
  | { ok: false; reason: string; current: Block | null };

/** The note with one block's text replaced — or the reason it cannot be, and the block as it now is. */
export function replaceBlock(note: string, ref: BlockRef, next: string): WriteResult {
  const spans = gqlSpans(note);
  const here = spans.find((s) => s.open === ref.line);
  const same = spans.filter((s) => s.text === ref.text);
  const target = here && here.text === ref.text ? here : same.length === 1 ? same[0] : undefined;
  if (!target) {
    if (same.length > 1) return { ok: false, reason: 'the block cannot be told apart from more than one identical block in the note', current: null };
    if (here) return { ok: false, reason: 'the block has changed since the pane read it', current: { text: here.text, line: here.open + 1 } };
    return { ok: false, reason: 'the block is no longer in the note where the pane read it', current: null };
  }
  // lines with their own endings, so every byte outside the block is kept
  const lines = note.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const eol = /\r\n$/.test(lines[target.open] ?? '') ? '\r\n' : '\n';
  const text = next.replace(/\r\n/g, '\n');
  const body = text.split('\n');
  const unclosed = target.close >= lines.length;
  const written = body.map((l, i) => (unclosed && i === body.length - 1 && !/\n$/.test(lines[lines.length - 1] ?? '') ? l : l + eol));
  lines.splice(target.open + 1, target.close - target.open - 1, ...written);
  return { ok: true, note: lines.join(''), ref: { line: target.open, text } };
}

/** The note with a new gql block written after the block `ref` — as Lock the graph writes a schema, last. */
export function insertBlockAfter(note: string, ref: BlockRef, text: string): WriteResult {
  const spans = gqlSpans(note);
  const here = spans.find((s) => s.open === ref.line && s.text === ref.text);
  const same = spans.filter((s) => s.text === ref.text);
  const target = here ?? (same.length === 1 ? same[0] : undefined);
  if (!target) return { ok: false, reason: 'the block has changed since the pane read it', current: null };
  const lines = note.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const eol = /\r\n$/.test(lines[target.open] ?? '') ? '\r\n' : '\n';
  const at = Math.min(target.close + 1, lines.length);
  const tail = at === lines.length && lines.length && !/\n$/.test(lines[lines.length - 1] ?? '') ? eol : '';
  const added = ['', '```gql', ...text.replace(/\r\n/g, '\n').split('\n'), '```'].map((l) => l + eol);
  if (tail) lines[lines.length - 1] += tail;
  lines.splice(at, 0, ...added);
  return { ok: true, note: lines.join(''), ref: { line: at + 1, text: text.replace(/\r\n/g, '\n') } };
}

/** The writes made from a pane, to undo and redo: each step is the block's text before and after. */
export class History {
  private readonly done: { before: string; after: string }[] = [];
  private readonly undone: { before: string; after: string }[] = [];

  record(before: string, after: string): void {
    if (before === after) return;
    this.done.push({ before, after });
    this.undone.length = 0;
  }

  canUndo(): boolean { return this.done.length > 0; }
  canRedo(): boolean { return this.undone.length > 0; }

  /** The text to write to undo the last write, or null when there is nothing to undo. */
  undo(): string | null {
    const step = this.done.pop();
    if (!step) return null;
    this.undone.push(step);
    return step.before;
  }

  /** The text to write to redo the last undone write, or null. */
  redo(): string | null {
    const step = this.undone.pop();
    if (!step) return null;
    this.done.push(step);
    return step.after;
  }
}
