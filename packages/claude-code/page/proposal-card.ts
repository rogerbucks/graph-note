// The card that shows what Claude proposed, for the user to accept or reject (spec §17, §26 cc_claude_proposes). Plain DOM,
// every word set as text. Built to WCAG 2.2 level AA (spec §11):
// - Each control is a real button with a name that says what it acts on.
// - The keyboard reaches each in reading order, with a visible focus (page.css).
// - Nothing is said by colour alone. A change is "Added", "Changed" or "Removed" in words. A state is a word.
// - A decision or a refusal is announced in the page's status region.
// - After a decision, focus returns to the heading of the card.
// The review itself is the core's (proposal-review.ts). The card only shows its rows and passes the user's choice on.
import { MARK_WORDS } from '../../core/src/proposals-marks.ts';
import type { Which } from '../../core/src/proposals-shown.ts';
import type { Card } from './proposal-review.ts';
import { word } from '../../core/src/words.ts';

/** What the card does with a choice: the page decides it and answers in words, a refusal included. */
export type Decide = (id: string, action: 'accept' | 'reject', which: Which, staleSeen: boolean) => Promise<string>;

const STATE_WORDS = {
  pending: 'proposal.waiting',
  accepted: 'proposal.accepted',
  rejected: 'proposal.rejected',
} as const;

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
    const heading = el('h2', word('proposal.by', { who: card.by }), { tabindex: '-1', id: `gn-proposal-${n}` });
    const section = el('section', undefined, { class: 'gn-card', 'aria-labelledby': heading.id });
    section.append(heading);
    for (const line of card.shown.provenance) section.append(el('p', line));
    // said in words and in a box of its own, never by colour alone
    let seen: HTMLInputElement | null = null;
    if (card.shown.stale) {
      const label = el('label', word('proposal.read-moved'));
      seen = el('input', undefined, { type: 'checkbox', id: `gn-seen-${n}` });
      label.setAttribute('for', seen.id);
      section.append(el('p', word('proposal.warning', { message: card.shown.stale.message })), seen, label);
    }
    const failed = card.shown.checked.results.filter((r) => !r.ok);
    if (failed.length)
      section.append(el('p', word('proposal.check-failed', { failed: failed.map((r) => r.label).join('; ') })));
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
      const who = row.decision ? word('proposal.decided-by', { who: row.decision.by }) : '';
      item.append(
        el('span', `${MARK_WORDS[row.mark]}: `),
        el('span', row.said),
        el('span', ` (${word(STATE_WORDS[row.state])}${who})`),
      );
      if (row.reason) item.append(el('p', word('proposal.reason', { reason: row.reason })));
      if (row.blocked) item.append(el('p', word('proposal.blocked', { why: row.blocked })));
      if (row.state === 'pending') {
        const named = `${MARK_WORDS[row.mark].toLowerCase()}: ${row.said}`;
        item.append(
          button(
            word('proposal.accept'),
            word('proposal.accept-change', { change: named }),
            [row.id],
            'accept',
            row.blocked !== null || failed.length > 0,
          ),
          button(word('proposal.reject'), word('proposal.reject-change', { change: named }), [row.id], 'reject'),
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
          word('proposal.accept-all-by'),
          word('proposal.accept-all-by.said', { who: card.by }),
          { all: true },
          'accept',
          failed.length > 0,
        ),
        button(
          word('proposal.reject-all-by'),
          word('proposal.reject-all-by.said', { who: card.by }),
          { all: true },
          'reject',
        ),
      );
      if (card.shown.grouped)
        for (const g of card.shown.groups.filter((x) => x.pending > 0)) {
          const label = word('proposal.page-group', { group: g.name });
          all.append(
            button(
              word('proposal.accept-group', { group: label }),
              word('proposal.accept-of', { group: label, who: card.by }),
              { group: g.name },
              'accept',
              failed.length > 0,
            ),
            button(
              word('proposal.reject-group', { group: label }),
              word('proposal.reject-of', { group: label, who: card.by }),
              { group: g.name },
              'reject',
            ),
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
