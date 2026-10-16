// A proposal's card (spec §17): above the drawing, who proposed it, when and what it read; a notice, before anything is
// accepted, when the graph has moved since; and the changes listed one to a row, each in plain English with Accept and
// Reject, or accepted and rejected all at once or a group at a time when there are many. Nothing is written until a
// person presses Accept. On a phone the list is a sheet at the bottom of the screen (proposals_phone), as the inspector
// is; each control is a 44-point target and says in words what it does.
import { Platform } from 'obsidian';
import type { ProposalShown, Which } from '@graph-note/core';

/** What a card is given of a proposal: data to show, and the functions that decide, which reading view closes. */
export interface ProposalCard {
  id: string;
  graph: string;
  /** The proposal as shown, but for the reading it lays over the graph, which the card draws. */
  shown: Omit<ProposalShown, 'reading'>;
  /** A person accepts or rejects; resolves to what came of it, in words. `staleSeen` once the notice has been read. */
  decide: (kind: 'accept' | 'reject', which: Which, staleSeen: boolean) => Promise<string>;
  /** Takes back the last decision, resolving to what came of it; none when there is nothing to take back. */
  undo: (() => Promise<string>) | null;
}

const day = (at: string) => at.slice(0, 10);
// A reason as its source gave it: the note keeps a model's reason with each Markdown mark escaped (§19), so it never
// renders there; the card sets it as plain text, so the marks are shown as written, never read
const plainReason = (reason: string) => reason.replace(/\\([\\`*_{}[\]()#+!|<>~&/@])/g, '$1');
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Draws the card under `root`; returns the buttons that write, which a read-only place takes away. */
export function renderProposalStrip(root: HTMLElement, card: ProposalCard): HTMLElement[] {
  const { shown } = card;
  const writes: HTMLElement[] = [];
  const accepts: { b: HTMLButtonElement; blocked: boolean }[] = [];
  let seen = false;
  const strip = root.createDiv({
    cls: 'graph-note-proposal',
    attr: { role: 'region', 'aria-label': `Proposal ${card.id} for graph ${card.graph}` },
  });
  strip.toggleClass('is-sheet', Platform.isPhone);
  const head = strip.createDiv({ cls: 'graph-note-proposal-head' });
  head.createEl('strong', { text: `Proposal ${card.id}` });
  head.createSpan({ cls: 'graph-note-kind', text: 'nothing is written until you accept' });
  const info = strip.createEl('ul', { cls: 'graph-note-proposal-provenance' });
  for (const line of shown.provenance) info.createEl('li', { text: line });
  // the graph spec's own check of the change set, said in words, each line that failed named (proposals_checked)
  const failed = shown.checked.results.filter((r) => !r.ok);
  const checked = strip.createDiv({
    cls: `graph-note-proposal-checked${failed.length ? ' is-failed' : ''}`,
    attr: { role: 'status' },
    text: failed.length
      ? `The graph spec’s check of this change set fails ${failed.length} of ${shown.checked.results.length}:`
      : `The graph spec’s check of this change set passes all ${shown.checked.results.length}.`,
  });
  if (failed.length) {
    const list = checked.createEl('ul');
    for (const r of failed) list.createEl('li', { text: r.label });
  }
  const status = strip.createDiv({
    cls: 'graph-note-proposal-status',
    attr: { role: 'status', 'aria-live': 'polite' },
  });

  // a button that decides: busy while it waits, and what came of it said in the status line
  const decide = (label: string, said: string, kind: 'accept' | 'reject', which: Which, into: HTMLElement) => {
    const b = into.createEl('button', {
      text: label,
      cls: `graph-note-proposal-${kind}`,
      attr: { type: 'button', 'aria-label': `${label}: ${said}` },
    });
    b.addEventListener('click', () => {
      b.disabled = true;
      void card.decide(kind, which, seen).then((result) => {
        status.setText(result);
        b.disabled = false;
      });
    });
    writes.push(b);
    return b;
  };
  const syncAccepts = () => {
    for (const a of accepts) a.b.disabled = a.blocked || (!!shown.stale && !seen);
  };

  if (shown.stale) {
    const notice = strip.createDiv({ cls: 'graph-note-banner graph-note-proposal-stale', attr: { role: 'alert' } });
    notice.createEl('p', { text: shown.stale.message });
    const ok = notice.createEl('button', { text: 'I have read this', attr: { type: 'button' } });
    writes.push(ok); // it only lets Accept on, so where nothing can be accepted it is taken away with the rest
    ok.addEventListener('click', () => {
      seen = true;
      ok.disabled = true;
      syncAccepts();
    });
  }

  const waiting = shown.rows.filter((r) => r.state === 'pending');
  const bulk = strip.createDiv({ cls: 'graph-note-proposal-bulk' });
  if (waiting.length) {
    const some = waiting.filter((r) => !r.blocked).length;
    // the ones that can be accepted now, by id: a change that cannot be does not stop the others
    const all = decide(
      `Accept all (${some})`,
      `every change that can be accepted now, ${plural(some, 'change')}`,
      'accept',
      waiting.filter((r) => !r.blocked).map((r) => r.id),
      bulk,
    );
    accepts.push({ b: all, blocked: some === 0 });
    decide(
      `Reject all (${waiting.length})`,
      `every change still waiting, ${plural(waiting.length, 'change')}`,
      'reject',
      { all: true },
      bulk,
    );
  } else bulk.createSpan({ cls: 'graph-note-quiet', text: 'Every change has been decided.' });
  if (card.undo) {
    const undo = card.undo;
    const b = bulk.createEl('button', {
      text: 'Undo',
      attr: { type: 'button', 'aria-label': 'Undo the last decision' },
    });
    b.addEventListener('click', () => void undo().then((result) => status.setText(result)));
    writes.push(b);
  }

  const rowsOf = (into: HTMLElement, ids: string[]) => {
    const list = into.createEl('ul', { cls: 'graph-note-proposal-rows' });
    for (const row of shown.rows.filter((r) => ids.includes(r.id))) {
      const li = list.createEl('li', {
        cls: `graph-note-proposal-row is-${row.mark} is-${row.state}`,
        attr: { 'data-change': row.id },
      });
      const text = li.createDiv({ cls: 'graph-note-proposal-text' });
      text.createSpan({ cls: 'graph-note-proposal-said', text: row.said });
      // what the change writes, exactly: the sentence can say less than this, and this is what is written
      text.appendText(' ');
      text.createEl('code', { cls: 'graph-note-proposal-code', text: row.text });
      if (row.reason) text.createSpan({ cls: 'graph-note-proposal-reason', text: ` — ${plainReason(row.reason)}` });
      if (row.blocked)
        text.createDiv({ cls: 'graph-note-proposal-blocked', text: `Cannot be accepted yet: ${row.blocked}` });
      if (row.decision)
        text.createDiv({
          cls: 'graph-note-proposal-decision',
          text: `${row.decision.state === 'accepted' ? 'Accepted' : 'Rejected'} by ${row.decision.by.replace(/_/g, ' ')} on ${day(row.decision.at)}`,
        });
      if (row.state !== 'pending') continue;
      const actions = li.createDiv({ cls: 'graph-note-proposal-actions' });
      // each button is named for the sentence and the text it acts on
      const named = `${row.said} (${row.text})`;
      accepts.push({ b: decide('Accept', named, 'accept', [row.id], actions), blocked: !!row.blocked });
      decide('Reject', named, 'reject', [row.id], actions);
    }
  };

  if (!shown.grouped)
    rowsOf(
      strip,
      shown.rows.map((r) => r.id),
    );
  else
    for (const g of shown.groups) {
      const fold = strip.createEl('details', { cls: 'graph-note-proposal-group', attr: { open: '' } });
      fold.createEl('summary', { text: `${g.name} — ${plural(g.ids.length, 'change')}, ${g.pending} waiting` });
      if (g.pending) {
        const actions = fold.createDiv({ cls: 'graph-note-proposal-bulk' });
        // those of the group that can be accepted now, by id, so one that cannot be does not stop the rest
        const ready = shown.rows.filter((r) => g.ids.includes(r.id) && r.state === 'pending' && !r.blocked);
        accepts.push({
          b: decide(
            `Accept ${g.name}`,
            `the ${plural(ready.length, 'change')} in ${g.name} that can be accepted now`,
            'accept',
            ready.map((r) => r.id),
            actions,
          ),
          blocked: ready.length === 0,
        });
        decide(`Reject ${g.name}`, `the ${g.pending} waiting in ${g.name}`, 'reject', { group: g.name }, actions);
      }
      rowsOf(fold, g.ids);
    }
  syncAccepts();
  return writes;
}
