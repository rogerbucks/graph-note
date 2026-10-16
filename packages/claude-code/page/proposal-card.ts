// The card that shows what Claude proposed, for the user to accept or reject (spec §17, §26 cc_claude_proposes). Plain DOM,
// every word set as text. Built to WCAG 2.2 level AA (spec §11): each control is a real button with a name that says what
// it acts on, reached by the keyboard in reading order with a visible focus (page.css), nothing is said by colour alone
// (a change is "Added", "Changed" or "Removed" in words, a state is a word), a decision or a refusal is announced in the
// page's status region, and after a decision focus returns to the heading of the card. The review itself is the core's
// (proposal-review.ts); the card only shows its rows and passes the user's choice on.
import { MARK_WORDS } from '../../core/src/proposals-marks.ts';
import type { Which } from '../../core/src/proposals-shown.ts';
import type { Card } from './proposal-review.ts';

/** What the card does with a choice: the page decides it and answers in words, a refusal included. */
export type Decide = (id: string, action: 'accept' | 'reject', which: Which, staleSeen: boolean) => Promise<string>;

const STATE_WORDS = { pending: 'Waiting for your decision', accepted: 'Accepted', rejected: 'Rejected' } as const;

/** Draws the proposals in `root` (emptied first); `announce` puts a message in the page's status region. */
export function showCards(root: HTMLElement, cards: Card[], decide: Decide, announce: (text: string) => void): void {
  const doc = root.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, attrs: Record<string, string> = {}) => {
    const e = doc.createElement(tag);
    if (text !== undefined) e.textContent = text;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const sections = cards.map((card, n) => {
    const heading = el('h2', `Proposed by ${card.by}`, { tabindex: '-1', id: `gn-proposal-${n}` });
    const section = el('section', undefined, { class: 'gn-card', 'aria-labelledby': heading.id });
    section.append(heading);
    for (const line of card.shown.provenance) section.append(el('p', line));
    // said in words and in a box of its own, never by colour alone
    let seen: HTMLInputElement | null = null;
    if (card.shown.stale) {
      const label = el('label', 'I have read that the graph has moved since this was proposed');
      seen = el('input', undefined, { type: 'checkbox', id: `gn-seen-${n}` });
      label.setAttribute('for', seen.id);
      section.append(el('p', `Warning: ${card.shown.stale.message}`), seen, label);
    }
    const failed = card.shown.checked.results.filter((r) => !r.ok);
    if (failed.length)
      section.append(el('p', `Check failed: ${failed.map((r) => r.label).join('; ')}. It cannot be accepted.`));
    const choose = (action: 'accept' | 'reject', which: Which) => async () =>
      announce(await decide(card.id, action, which, seen?.checked ?? false));
    const button = (label: string, name: string, which: Which, action: 'accept' | 'reject', off = false) => {
      const b = el('button', label, { type: 'button', 'aria-label': name, class: 'gn-card-button' });
      if (off) b.setAttribute('disabled', '');
      b.addEventListener('click', () => void choose(action, which)());
      return b;
    };
    const list = el('ul', undefined, { class: 'gn-card-changes' });
    for (const row of card.rows) {
      const item = el('li');
      const who = row.decision ? ` by ${row.decision.by}` : '';
      item.append(
        el('span', `${MARK_WORDS[row.mark]}: `),
        el('span', row.said),
        el('span', ` (${STATE_WORDS[row.state]}${who})`),
      );
      if (row.reason) item.append(el('p', `Reason: ${row.reason}`));
      if (row.blocked) item.append(el('p', `Cannot be accepted yet: ${row.blocked}`));
      if (row.state === 'pending') {
        const named = `${MARK_WORDS[row.mark].toLowerCase()}: ${row.said}`;
        item.append(
          button(
            'Accept',
            `Accept this change, ${named}`,
            [row.id],
            'accept',
            row.blocked !== null || failed.length > 0,
          ),
          button('Reject', `Reject this change, ${named}`, [row.id], 'reject'),
        );
      }
      list.append(item);
    }
    section.append(list);
    const waiting = card.rows.some((r) => r.state === 'pending');
    if (waiting) {
      const all = el('div', undefined, { class: 'gn-card-all' });
      all.append(
        button(
          'Accept all',
          `Accept all changes waiting in the proposal by ${card.by}`,
          { all: true },
          'accept',
          failed.length > 0,
        ),
        button('Reject all', `Reject all changes waiting in the proposal by ${card.by}`, { all: true }, 'reject'),
      );
      if (card.shown.grouped)
        for (const g of card.shown.groups.filter((x) => x.pending > 0)) {
          const label = `group ${g.name}`;
          all.append(
            button(
              `Accept ${label}`,
              `Accept ${label} of the proposal by ${card.by}`,
              { group: g.name },
              'accept',
              failed.length > 0,
            ),
            button(`Reject ${label}`, `Reject ${label} of the proposal by ${card.by}`, { group: g.name }, 'reject'),
          );
        }
      section.append(all);
    }
    return section;
  });
  root.replaceChildren(...sections);
}

/** After a decision the card is drawn again, so focus goes to the first heading rather than to nothing. */
export function focusCards(root: HTMLElement): void {
  const heading = root.querySelector<HTMLElement>('h2');
  heading?.focus();
}
