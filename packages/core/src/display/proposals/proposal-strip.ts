// A proposal's card (spec §17): above the drawing, who proposed it, when and what it read; a notice, before anything is
// accepted, when the graph has moved since; and the changes listed one to a row, each in plain English with Accept and
// Reject, or accepted and rejected all at once or a group at a time when there are many. Nothing is written until a
// person presses Accept. On a phone the list is a sheet at the bottom of the screen (proposals_phone), as the inspector
// is; each control is a 44-point target and says in words what it does.
import { isPhone } from '../host';
import { word } from '@thoughtknot/core';
import type { ProposalShown, Which } from '@thoughtknot/core';

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

/** Draws the card under `root`; returns the buttons that write, which a read-only place takes away. */
export function renderProposalStrip(root: HTMLElement, card: ProposalCard): HTMLElement[] {
  const { shown } = card;
  const writes: HTMLElement[] = [];
  const accepts: { b: HTMLButtonElement; blocked: boolean }[] = [];
  let seen = false;
  const strip = root.createDiv({
    cls: 'thoughtknot-proposal',
    attr: { role: 'region', 'aria-label': word('proposal.region', { id: card.id, graph: card.graph }) },
  });
  strip.toggleClass('is-sheet', isPhone());
  const head = strip.createDiv({ cls: 'thoughtknot-proposal-head' });
  head.createEl('strong', { text: word('proposal.name', { id: card.id }) });
  head.createSpan({ cls: 'thoughtknot-kind', text: word('proposal.not-yet-written') });
  const info = strip.createEl('ul', { cls: 'thoughtknot-proposal-provenance' });
  for (const line of shown.provenance) info.createEl('li', { text: line });
  // the graph spec's own check of the change set, said in words, each line that failed named (proposals_checked)
  const failed = shown.checked.results.filter((r) => !r.ok);
  const checked = strip.createDiv({
    cls: `thoughtknot-proposal-checked${failed.length ? ' is-failed' : ''}`,
    attr: { role: 'status' },
    text: failed.length
      ? word('proposal.check-fails', { failed: failed.length, count: shown.checked.results.length })
      : word('proposal.check-passes', { count: shown.checked.results.length }),
  });
  if (failed.length) {
    const list = checked.createEl('ul');
    for (const r of failed) list.createEl('li', { text: r.label });
  }
  const status = strip.createDiv({
    cls: 'thoughtknot-proposal-status',
    attr: { role: 'status', 'aria-live': 'polite' },
  });

  // a button that decides: busy while it waits, and what came of it said in the status line
  const decide = (label: string, said: string, kind: 'accept' | 'reject', which: Which, into: HTMLElement) => {
    const b = into.createEl('button', {
      text: label,
      cls: `thoughtknot-proposal-${kind}`,
      attr: { type: 'button', 'aria-label': word('proposal.decide', { label, said }) },
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
    const notice = strip.createDiv({ cls: 'thoughtknot-banner thoughtknot-proposal-stale', attr: { role: 'alert' } });
    notice.createEl('p', { text: shown.stale.message });
    const ok = notice.createEl('button', { text: word('proposal.read-this'), attr: { type: 'button' } });
    writes.push(ok); // it only lets Accept on, so where nothing can be accepted it is taken away with the rest
    ok.addEventListener('click', () => {
      seen = true;
      ok.disabled = true;
      syncAccepts();
    });
  }

  const waiting = shown.rows.filter((r) => r.state === 'pending');
  const bulk = strip.createDiv({ cls: 'thoughtknot-proposal-bulk' });
  if (waiting.length) {
    const some = waiting.filter((r) => !r.blocked).length;
    // the ones that can be accepted now, by id: a change that cannot be does not stop the others
    const all = decide(
      word('proposal.accept-all', { count: some }),
      word('proposal.accept-all.said', { count: some }),
      'accept',
      waiting.filter((r) => !r.blocked).map((r) => r.id),
      bulk,
    );
    accepts.push({ b: all, blocked: some === 0 });
    decide(
      word('proposal.reject-all', { count: waiting.length }),
      word('proposal.reject-all.said', { count: waiting.length }),
      'reject',
      { all: true },
      bulk,
    );
  } else bulk.createSpan({ cls: 'thoughtknot-quiet', text: word('proposal.all-decided') });
  if (card.undo) {
    const undo = card.undo;
    const b = bulk.createEl('button', {
      text: word('proposal.undo'),
      attr: { type: 'button', 'aria-label': word('proposal.undo.said') },
    });
    b.addEventListener('click', () => void undo().then((result) => status.setText(result)));
    writes.push(b);
  }

  const rowsOf = (into: HTMLElement, ids: string[]) => {
    const list = into.createEl('ul', { cls: 'thoughtknot-proposal-rows' });
    for (const row of shown.rows.filter((r) => ids.includes(r.id))) {
      const li = list.createEl('li', {
        cls: `thoughtknot-proposal-row is-${row.mark} is-${row.state}`,
        attr: { 'data-change': row.id },
      });
      const text = li.createDiv({ cls: 'thoughtknot-proposal-text' });
      text.createSpan({ cls: 'thoughtknot-proposal-said', text: row.said });
      // what the change writes, exactly: the sentence can say less than this, and this is what is written
      text.appendText(' ');
      text.createEl('code', { cls: 'thoughtknot-proposal-code', text: row.text });
      if (row.reason) text.createSpan({ cls: 'thoughtknot-proposal-reason', text: ` — ${plainReason(row.reason)}` });
      if (row.blocked)
        text.createDiv({ cls: 'thoughtknot-proposal-blocked', text: word('proposal.blocked', { why: row.blocked }) });
      if (row.decision)
        text.createDiv({
          cls: 'thoughtknot-proposal-decision',
          text: word(row.decision.state === 'accepted' ? 'proposal.accepted-by' : 'proposal.rejected-by', {
            who: row.decision.by.replace(/_/g, ' '),
            day: day(row.decision.at),
          }),
        });
      if (row.state !== 'pending') continue;
      const actions = li.createDiv({ cls: 'thoughtknot-proposal-actions' });
      // each button is named for the sentence and the text it acts on
      const named = `${row.said} (${row.text})`;
      accepts.push({ b: decide(word('proposal.accept'), named, 'accept', [row.id], actions), blocked: !!row.blocked });
      decide(word('proposal.reject'), named, 'reject', [row.id], actions);
    }
  };

  if (!shown.grouped)
    rowsOf(
      strip,
      shown.rows.map((r) => r.id),
    );
  else
    for (const g of shown.groups) {
      const fold = strip.createEl('details', { cls: 'thoughtknot-proposal-group', attr: { open: '' } });
      fold.createEl('summary', {
        text: word('proposal.group', { group: g.name, count: g.ids.length, waiting: g.pending }),
      });
      if (g.pending) {
        const actions = fold.createDiv({ cls: 'thoughtknot-proposal-bulk' });
        // those of the group that can be accepted now, by id, so one that cannot be does not stop the rest
        const ready = shown.rows.filter((r) => g.ids.includes(r.id) && r.state === 'pending' && !r.blocked);
        accepts.push({
          b: decide(
            word('proposal.accept-group', { group: g.name }),
            word('proposal.accept-group.said', { group: g.name, count: ready.length }),
            'accept',
            ready.map((r) => r.id),
            actions,
          ),
          blocked: ready.length === 0,
        });
        decide(
          word('proposal.reject-group', { group: g.name }),
          word('proposal.reject-group.said', { group: g.name, count: g.pending }),
          'reject',
          { group: g.name },
          actions,
        );
      }
      rowsOf(fold, g.ids);
    }
  syncAccepts();
  return writes;
}
