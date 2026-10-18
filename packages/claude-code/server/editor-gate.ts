// The gate inside the editor's server (spec §26, cc_classified_asks, cc_credential_never): the core's `claudeGate` asked
// before every send of a note, not only when the mod opens it, so a note changed on disk after the check never reaches
// the page, which Claude can read. A refusal is words that name a kind and a level, never the note's label or its text.
import { claudeGate, sha256 } from '@thoughtknot/core';
import type { Gate, GateSettings } from '@thoughtknot/core';

/** What the store asks before it sends a note's text, or a draft: the reason it may not be sent, or null when it may. */
export interface NoteGate {
  /**
   * For the note as it is on disk. `vouched` is the digest of the text this editor itself last wrote: the user typed it,
   * so it never needs the question again, though it is refused as any text is for the highest classification, an
   * unknown one or a credential.
   */
  note: (text: string, vouched: string | null) => string | null;
  /** For a draft: what the user typed on the note, held to the same refusals, but never asked about again. */
  draft: (text: string) => string | null;
  /**
   * For a file of the note's repository read from GitHub for a review (github_review_items): refused as any text is for
   * a credential or a classification it gives, but one that gives none counts as the lowest classification, since the
   * user asked for their own repository's change. Where a gate has no word on files, every file is withheld.
   */
  file?: (text: string) => string | null;
}

const said = (gate: Gate): string | null =>
  'open' in gate ? null : 'ask' in gate ? `${gate.ask} The yes it was given does not cover this text.` : gate.refuse;

/**
 * The store's gate over the settings, with the digest of the text the user said yes to (null when none was asked). A
 * yes is for that text alone: once the note is changed by anything but this editor, it asks again, and so refuses.
 */
export function storeGate(settings: GateSettings, confirmed: string | null): NoteGate {
  return {
    note: (text, vouched) => {
      const first = claudeGate(text, settings, confirmed);
      if (!('ask' in first) || vouched === null) return said(first);
      return said(claudeGate(text, settings, vouched));
    },
    draft: (text) => said(claudeGate(text, settings, sha256(text))),
    file: (text) => said(claudeGate(text, { ...settings, aiUnlabelled: settings.classifications[0] ?? '' }, null)),
  };
}
