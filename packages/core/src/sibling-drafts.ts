// Drafts of a thing at the bands next to its own (editor spec §32, sibling_drafts). The person writes a thing at its
// own band. The editor asks the AI feature for drafts at the neighbouring bands, from each band's criteria and the
// corrections accepted before. Each draft comes back as a proposal marked as a draft: nothing is written until the
// person accepts it. Accepting writes the draft, or the person's correction of it, as a PROJECTED_FOR link. A
// correction also joins that band's examples, so the next drafts are sharper.
//
// The request is data, never words in the code: the AI feature, given as `ask`, makes its own prompt from it.

/** One audience band: its profile id, its three criteria and the corrections accepted for it. */
export interface BandCriteria {
  band: string;
  criteria: Readonly<Record<string, string>>;
  examples: readonly { draft: string; corrected: string }[];
}

/** What the AI feature is asked for: a draft of a thing's text at one band, from another band's text. */
export interface DraftRequest {
  task: 'sibling-draft';
  thing: string;
  from: string;
  to: string;
  text: string;
  criteria: Readonly<Record<string, string>>;
  examples: readonly { draft: string; corrected: string }[];
}

/** A draft back from the AI feature, waiting for the person. */
export interface DraftProposal {
  thing: string;
  band: string;
  text: string;
  /** Always true: a draft is a proposal, never the person's own text. */
  draft: true;
  by: 'ai';
}

/** The bands next to `band` in the order given, nearer first: the one before, then the one after. */
export function neighbourBands(order: readonly string[], band: string): string[] {
  const i = order.indexOf(band);
  if (i < 0) return [];
  return [order[i - 1], order[i + 1]].filter((b): b is string => b !== undefined);
}

/** The requests for drafts of a thing at each band next to its own, each with that band's criteria and examples. */
export function draftRequests(
  thing: string,
  band: string,
  text: string,
  order: readonly string[],
  bands: readonly BandCriteria[],
): DraftRequest[] {
  return neighbourBands(order, band).flatMap((to) => {
    const b = bands.find((x) => x.band === to);
    return b
      ? [{ task: 'sibling-draft' as const, thing, from: band, to, text, criteria: b.criteria, examples: b.examples }]
      : [];
  });
}

/** The drafts the AI feature gives, `ask` answering each request, as proposals. Nothing is written. */
export async function siblingDrafts(
  requests: readonly DraftRequest[],
  ask: (request: DraftRequest) => Promise<string>,
): Promise<DraftProposal[]> {
  const out: DraftProposal[] = [];
  for (const r of requests) out.push({ thing: r.thing, band: r.to, text: await ask(r), draft: true, by: 'ai' });
  return out;
}

/** A value written as quoted graph text. */
const quoted = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * A draft the person accepts, as written or corrected. It gives the PROJECTED_FOR line to write. A correction joins
 * the band's examples, so later drafts follow it. Accepting the draft as it is changes no criteria.
 */
export function acceptDraft(
  bands: readonly BandCriteria[],
  proposal: DraftProposal,
  corrected?: string,
): { line: string; bands: BandCriteria[] } {
  const text = corrected ?? proposal.text;
  const line = `(${proposal.thing})-[:PROJECTED_FOR {text: ${quoted(text)}}]->(${proposal.band})`;
  if (corrected === undefined || corrected === proposal.text) return { line, bands: [...bands] };
  return {
    line,
    bands: bands.map((b) =>
      b.band === proposal.band ? { ...b, examples: [...b.examples, { draft: proposal.text, corrected }] } : b,
    ),
  };
}
